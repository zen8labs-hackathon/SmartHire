import { z } from "zod";

import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requireJobViewForApplication } from "@/lib/authz/require-application-job-view";
import { extractTextFromBuffer } from "@/lib/ai/extract-jd";
import {
  buildEvaluationFillPayload,
  listPdfFormFieldNames,
  renderFilledEvaluationPdf,
} from "@/lib/ai/fill-candidate-evaluation";
import { getCampaignAppliedAdminRowById } from "@/lib/db/campaign-applied-list";
import { createCandidateNote } from "@/lib/db/candidate-notes";
import {
  createCandidateEvaluationReview,
  listCandidateEvaluationReviewsByCampaignApplied,
} from "@/lib/db/candidate-evaluation-reviews";
import { getPool } from "@/lib/db/config/client";
import { getJobEvaluateTemplate } from "@/lib/db/job-permissions";
import { loadCombinedReviewerNotesForEvaluation } from "@/lib/evaluation/combine-reviewer-notes";
import {
  createSignedDownloadUrl,
  deleteObject,
  downloadObject,
  uploadObject,
} from "@/lib/storage/s3";
import { buildStorageFilename } from "@/lib/storage/storage-key";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

const postBodySchema = z
  .object({
    /** Optional extra lines for the AI (e.g. email, role) */
    candidateSnapshot: z.record(z.string(), z.string()).optional(),
    /**
     * Optional note saved immediately before generation (same request).
     * All saved notes for this application are always included in the AI input.
     */
    newInterviewNote: z.string().max(32_000).optional(),
  })
  .strict();

/** Latest generated evaluation PDF for this application, if any. */
export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId || !UUID_RE.test(campaignAppliedId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const appAccess = await requireJobViewForApplication(
    auth.access,
    campaignAppliedId,
  );
  if (!appAccess.ok) return appAccess.response;

  const [latest] = await listCandidateEvaluationReviewsByCampaignApplied(
    getPool(),
    campaignAppliedId,
  );

  if (!latest || latest.revoked_at) {
    return Response.json({ latest: null });
  }

  try {
    const downloadUrl = await createSignedDownloadUrl(
      latest.filled_pdf_storage_path,
      3600,
    );
    return Response.json({
      latest: {
        id: latest.id,
        createdAt: latest.created_at,
        previewPath: `/evaluation-preview/${latest.preview_token}`,
        downloadUrl,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not create download link.";
    return Response.json({ error: msg }, { status: 500 });
  }
}

/**
 * Generates a filled evaluation PDF from this job's `job_evaluate_templates`
 * row + the application's combined pre-interview/interview notes, uploads it
 * to S3, and records a `candidate_evaluation_reviews` row. Replaces the old
 * `job-descriptions/[id]/evaluations` POST, which read the dead
 * `candidate_evaluation_template` singleton and Supabase Storage.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId || !UUID_RE.test(campaignAppliedId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const appAccess = await requireJobViewForApplication(
    auth.access,
    campaignAppliedId,
  );
  if (!appAccess.ok) return appAccess.response;

  let body: z.infer<typeof postBodySchema>;
  try {
    const json = await request.json();
    body = postBodySchema.parse(json);
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.message : "Invalid JSON body.";
    return Response.json({ error: msg }, { status: 400 });
  }

  const db = getPool();
  const application = await getCampaignAppliedAdminRowById(db, campaignAppliedId);
  if (!application) {
    return Response.json({ error: "Candidate application not found." }, { status: 404 });
  }

  const newNote = body.newInterviewNote?.trim();
  if (newNote) {
    await createCandidateNote(db, {
      campaignAppliedId,
      type: "interview",
      body: newNote,
      authorId: auth.userId,
    });
  }

  const reviewerNotes = await loadCombinedReviewerNotesForEvaluation(
    db,
    campaignAppliedId,
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

  const template = await getJobEvaluateTemplate(db, application.job_id);
  if (!template?.storage_path) {
    return Response.json(
      {
        error:
          "No evaluation template uploaded yet for this job. Go to the job's Evaluation template page and upload a PDF.",
      },
      { status: 400 },
    );
  }

  let templateBytes: Buffer;
  try {
    templateBytes = await downloadObject(template.storage_path);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load evaluation template.";
    return Response.json({ error: msg }, { status: 500 });
  }

  const mime = template.mime_type || "application/pdf";
  const templateText = await extractTextFromBuffer(templateBytes, mime);
  const formFieldNames = await listPdfFormFieldNames(templateBytes);

  const candidateName = application.candidate_name?.trim() || "Candidate";
  const snapLines = body.candidateSnapshot
    ? Object.entries(body.candidateSnapshot)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n")
    : "";
  const candidateSummary = [`Name: ${candidateName}`, snapLines]
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
      candidateName,
      templateHasAcroFormFields: formFieldNames.length > 0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PDF render failed.";
    return Response.json({ error: msg }, { status: 500 });
  }

  const outPath = `evaluation/${campaignAppliedId}/${buildStorageFilename(candidateName, ".pdf")}`;

  try {
    await uploadObject(outPath, Buffer.from(pdfOut), "application/pdf");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not upload generated PDF.";
    return Response.json({ error: msg }, { status: 500 });
  }

  const aiPayload = {
    formFields: formFieldNames,
    fieldMap: fill.fieldMap,
    documentSections: fill.documentSections,
    outputMode:
      formFieldNames.length > 0 ? "filled_template_pdf" : "standalone_sections_pdf",
  };

  let inserted;
  try {
    inserted = await createCandidateEvaluationReview(db, {
      campaignAppliedId,
      candidateName,
      reviewerNotes,
      filledPdfStoragePath: outPath,
      aiFieldMapping: aiPayload,
      createdBy: auth.userId,
    });
  } catch (e) {
    await deleteObject(outPath).catch(() => {});
    const msg = e instanceof Error ? e.message : "Insert failed.";
    return Response.json({ error: msg }, { status: 500 });
  }

  let downloadUrl: string | null = null;
  try {
    downloadUrl = await createSignedDownloadUrl(outPath, 3600);
  } catch {
    downloadUrl = null;
  }

  return Response.json({
    reviewId: inserted.id,
    previewPath: `/evaluation-preview/${inserted.preview_token}`,
    downloadUrl,
  });
}
