import { z } from "zod";

import {
  buildEvaluationFillPayload,
  listPdfFormFieldNames,
  renderFilledEvaluationPdf,
} from "@/lib/ai/fill-candidate-evaluation";
import { extractTextFromBuffer } from "@/lib/ai/extract-jd";
import { CANDIDATE_EVAL_FILLED_BUCKET } from "@/lib/evaluation/filled-pdf-bucket";
import { loadCombinedReviewerNotesForEvaluation } from "@/lib/evaluation/combine-reviewer-notes";
import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { createAdminClient } from "@/lib/supabase/admin";
import { newUuidV7 } from "@/lib/uuid-v7";

const postBodySchema = z.object({
  pipelineCandidateId: z.string().uuid(),
  candidateName: z.string().min(1).max(200),
  /** Optional extra lines for the AI (e.g. email, role) */
  candidateSnapshot: z.record(z.string(), z.string()).optional(),
  /**
   * Optional note saved immediately before generation (same request).
   * All saved notes for this candidate are always included in the AI input.
   */
  newInterviewNote: z.string().max(32_000).optional(),
});

// GET (latest-eval lookup) removed -- superseded by
// `GET /api/admin/candidates/[id]/evaluations` (keyed by `campaign_applied.id`,
// see DB7X2K evaluation-domain read-path log). This file's POST (PDF
// fill/render/upload) has no such replacement yet -- it's kept below,
// unmigrated, as reference: it still reads/writes via `auth.supabase`
// (removed) and the `candidate_evaluation_template` singleton table, which
// the DB7X2K schema no longer has an equivalent for (see the
// evaluation-template scoping note in the candidates-dashboard log).

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: jdParam } = await context.params;
  const jdId = Number(jdParam);
  if (!Number.isInteger(jdId) || jdId <= 0) {
    return Response.json({ error: "Invalid job description id." }, { status: 400 });
  }

  let body: z.infer<typeof postBodySchema>;
  try {
    const json = await request.json();
    body = postBodySchema.parse(json);
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.message : "Invalid JSON body.";
    return Response.json({ error: msg }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return Response.json(
      { error: "Server missing service role key." },
      { status: 500 },
    );
  }

  const newNote = body.newInterviewNote?.trim();
  if (newNote) {
    const { error: noteErr } = await auth.supabase
      .from("candidate_interview_notes")
      .insert({
        job_description_id: jdId,
        pipeline_candidate_id: body.pipelineCandidateId,
        author_id: auth.userId,
        body: newNote,
      });
    if (noteErr) {
      return Response.json(
        { error: noteErr.message ?? "Could not save interview note." },
        { status: 400 },
      );
    }
  }

  const reviewerNotes = await loadCombinedReviewerNotesForEvaluation(
    admin,
    jdId,
    body.pipelineCandidateId,
  );
  if (!reviewerNotes.trim()) {
    return Response.json(
      {
        error:
          "Add a pre-interview note and/or at least one interview note (save a note first, or include newInterviewNote) before generating an evaluation.",
      },
      { status: 400 },
    );
  }

  const { data: jd, error: jdErr } = await auth.supabase
    .from("job_descriptions")
    .select("id")
    .eq("id", jdId)
    .maybeSingle();

  if (jdErr || !jd) {
    return Response.json({ error: "Job description not found." }, { status: 404 });
  }

  const { data: tmpl, error: tmplErr } = await admin
    .from("candidate_evaluation_template")
    .select("storage_path, mime_type")
    .eq("id", 1)
    .maybeSingle();

  if (tmplErr) {
    return Response.json({ error: tmplErr.message }, { status: 500 });
  }

  const storagePath = (tmpl as { storage_path: string | null } | null)?.storage_path;
  if (!storagePath) {
    return Response.json(
      {
        error:
          "No evaluation template uploaded yet. Go to Admin → Evaluation template and upload a PDF.",
      },
      { status: 400 },
    );
  }

  const mime =
    (tmpl as { mime_type: string | null }).mime_type || "application/pdf";
  const { data: templateBlob, error: dlErr } = await admin.storage
    .from("candidate-evaluation-template")
    .download(storagePath);

  if (dlErr || !templateBlob) {
    return Response.json(
      { error: dlErr?.message ?? "Could not load evaluation template." },
      { status: 500 },
    );
  }

  const templateBytes = new Uint8Array(await templateBlob.arrayBuffer());
  const templateText = await extractTextFromBuffer(Buffer.from(templateBytes), mime);
  const formFieldNames = await listPdfFormFieldNames(templateBytes);

  const snapLines = body.candidateSnapshot
    ? Object.entries(body.candidateSnapshot)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n")
    : "";
  const candidateSummary = [`Name: ${body.candidateName}`, snapLines]
    .filter(Boolean)
    .join("\n");

  const fill = await buildEvaluationFillPayload({
    formFieldNames,
    templateTextSample: templateText,
    candidateSummary,
    reviewerNotes,
  });

  let pdfOut: Uint8Array;
  try {
    pdfOut = await renderFilledEvaluationPdf({
      templatePdfBytes: templateBytes,
      fill,
      candidateName: body.candidateName,
      templateHasAcroFormFields: formFieldNames.length > 0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PDF render failed.";
    return Response.json({ error: msg }, { status: 500 });
  }

  const reviewId = newUuidV7();
  const outPath = `${jdId}/${reviewId}.pdf`;

  const { error: upErr } = await admin.storage
    .from(CANDIDATE_EVAL_FILLED_BUCKET)
    .upload(outPath, Buffer.from(pdfOut), {
      contentType: "application/pdf",
      upsert: false,
    });

  if (upErr) {
    return Response.json({ error: upErr.message }, { status: 500 });
  }

  const aiPayload = {
    formFields: formFieldNames,
    fieldMap: fill.fieldMap,
    documentSections: fill.documentSections,
    outputMode:
      formFieldNames.length > 0 ? "filled_template_pdf" : "standalone_sections_pdf",
  };

  const { data: inserted, error: insErr } = await auth.supabase
    .from("candidate_evaluation_reviews")
    .insert({
      id: reviewId,
      job_description_id: jdId,
      pipeline_candidate_id: body.pipelineCandidateId,
      candidate_name: body.candidateName,
      reviewer_notes: reviewerNotes,
      filled_pdf_storage_path: outPath,
      ai_field_mapping: aiPayload,
      created_by: auth.userId,
    })
    .select("id, preview_token")
    .single();

  if (insErr || !inserted) {
    await admin.storage.from(CANDIDATE_EVAL_FILLED_BUCKET).remove([outPath]);
    return Response.json({ error: insErr?.message ?? "Insert failed." }, { status: 500 });
  }

  const ins = inserted as { id: string; preview_token: string };

  const { data: dlSigned } = await admin.storage
    .from(CANDIDATE_EVAL_FILLED_BUCKET)
    .createSignedUrl(outPath, 3600);

  return Response.json({
    reviewId: ins.id,
    previewPath: `/evaluation-preview/${ins.preview_token}`,
    downloadUrl: dlSigned?.signedUrl ?? null,
  });
}
