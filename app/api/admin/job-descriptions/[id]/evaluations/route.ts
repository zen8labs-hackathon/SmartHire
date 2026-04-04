import { z } from "zod";

import {
  buildEvaluationFillPayload,
  listPdfFormFieldNames,
  renderFilledEvaluationPdf,
} from "@/lib/ai/fill-candidate-evaluation";
import { extractTextFromBuffer } from "@/lib/ai/extract-jd";
import { CANDIDATE_EVAL_FILLED_BUCKET } from "@/lib/evaluation/filled-pdf-bucket";
import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { createAdminClient } from "@/lib/supabase/admin";
import { newUuidV7 } from "@/lib/uuid-v7";

const postBodySchema = z.object({
  pipelineCandidateId: z.string().uuid(),
  candidateName: z.string().min(1).max(200),
  /** Optional extra lines for the AI (e.g. email, role) */
  candidateSnapshot: z.record(z.string(), z.string()).optional(),
  reviewerNotes: z.string().min(1).max(32_000),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: jdParam } = await context.params;
  const jdId = Number(jdParam);
  if (!Number.isInteger(jdId) || jdId <= 0) {
    return Response.json({ error: "Invalid job description id." }, { status: 400 });
  }

  const url = new URL(request.url);
  const rawPc = url.searchParams.get("pipelineCandidateId")?.trim() ?? "";
  const pcParsed = z.string().uuid().safeParse(rawPc);
  if (!pcParsed.success) {
    return Response.json(
      { error: "Missing or invalid pipelineCandidateId (expected UUID)." },
      { status: 400 },
    );
  }
  const pipelineCandidateId = pcParsed.data;

  const { data: row, error } = await auth.supabase
    .from("candidate_evaluation_reviews")
    .select("id, created_at, preview_token, filled_pdf_storage_path")
    .eq("job_description_id", jdId)
    .eq("pipeline_candidate_id", pipelineCandidateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!row) {
    return Response.json({ latest: null });
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

  const path = row.filled_pdf_storage_path as string;
  const { data: signed, error: signErr } = await admin.storage
    .from(CANDIDATE_EVAL_FILLED_BUCKET)
    .createSignedUrl(path, 3600);

  if (signErr || !signed?.signedUrl) {
    return Response.json(
      { error: signErr?.message ?? "Could not sign download URL." },
      { status: 500 },
    );
  }

  const r = row as {
    id: string;
    created_at: string;
    preview_token: string;
    filled_pdf_storage_path: string;
  };

  return Response.json({
    latest: {
      id: r.id,
      createdAt: r.created_at,
      previewPath: `/evaluation-preview/${r.preview_token}`,
      downloadUrl: signed.signedUrl,
    },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminForRequest(request);
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

  const { data: jd, error: jdErr } = await auth.supabase
    .from("job_descriptions")
    .select("id")
    .eq("id", jdId)
    .maybeSingle();

  if (jdErr || !jd) {
    return Response.json({ error: "Job description not found." }, { status: 404 });
  }

  const { data: tmpl, error: tmplErr } = await auth.supabase
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

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return Response.json(
      { error: "Server missing service role key." },
      { status: 500 },
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
    reviewerNotes: body.reviewerNotes,
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
      reviewer_notes: body.reviewerNotes,
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
