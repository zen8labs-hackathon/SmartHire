import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import {
  duplicateNewUploadPreviewFromRow,
  findDuplicateCandidateHits,
  shouldFetchCandidatesForDedupe,
  parsedContactFromPayload,
  type CandidateDedupeRow,
  type DuplicateCandidateHit,
  type DuplicateNewUploadPreview,
} from "@/lib/candidates/duplicate-detection";
import { extractTextFromBuffer } from "@/lib/jd/extract-document-text";
import { cvContentSha256Hex, cvFileSha256Hex } from "@/lib/candidates/cv-hash";
import { parseResumeWithAI } from "@/lib/ai/parse-resume";
import { runJdMatchForCandidate } from "@/lib/candidates/jd-match";
import { getCampaignAppliedAdminRowById } from "@/lib/db/campaign-applied-list";
import { getCampaignAppliedById } from "@/lib/db/campaign-applied";
import {
  getCvDetailVersionById,
  lockCvDetailVersionForParsing,
  updateCvDetailVersionParsingResult,
} from "@/lib/db/cv-detail-versions";
import { syncCandidateAggregateFields } from "@/lib/db/candidates";
import {
  dedupeMatchStatusLabel,
  findCandidatesByDedupeSignals,
} from "@/lib/db/candidates-dedupe";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { downloadObject } from "@/lib/storage/s3";
import { isUniqueViolation } from "@/lib/db/query-helpers";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Runs CV text extraction + AI parsing for this application's active CV
 * version and persists the result. Replaces the old `process-cv` Supabase
 * Edge Function (`supabase/functions/process-cv`), which read/wrote the
 * pre-DB7X2K single-table `candidates` schema and downloaded from Supabase
 * Storage -- both gone. No storage-path "prettifying" rename step (the old
 * function moved the file into a `{job}/{name}_{timestamp}_{uuid}/` folder
 * for human Storage-browser convenience); the new S3 layout is a flat
 * `cv/{uuid}{ext}` key assigned once at upload time and nothing reads
 * structure out of it, so there's nothing to preserve by renaming.
 */
async function runCvParsing(
  campaignAppliedId: string,
): Promise<{ ok: true; skipped: true; reason: string } | { ok: true; skipped: false } | { ok: false; error: string }> {
  const db = getPool();

  const campaignApplied = await getCampaignAppliedById(db, campaignAppliedId);
  if (!campaignApplied) {
    return { ok: false, error: "Candidate application not found" };
  }
  if (!campaignApplied.active_cv_version_id) {
    return { ok: false, error: "No CV file on record for this application" };
  }

  const cvVersion = await getCvDetailVersionById(
    db,
    campaignApplied.active_cv_version_id,
  );
  if (!cvVersion) {
    return { ok: false, error: "Active CV version not found" };
  }

  if (cvVersion.parsing_status === "completed") {
    return { ok: true, skipped: true, reason: "already_completed" };
  }
  if (cvVersion.parsing_status === "processing") {
    return { ok: true, skipped: true, reason: "already_processing" };
  }

  const locked = await lockCvDetailVersionForParsing(db, cvVersion.id, [
    "pending",
    "failed",
  ]);
  if (!locked) {
    return { ok: true, skipped: true, reason: "race_or_state" };
  }

  try {
    if (!cvVersion.cv_storage_path) {
      throw new Error("No CV file path on record for this version");
    }

    const bytes = await downloadObject(cvVersion.cv_storage_path);
    const cvFileSha256 = cvFileSha256Hex(bytes);

    const plainText = await extractTextFromBuffer(
      bytes,
      cvVersion.mime_type || "application/octet-stream",
    );
    if (!plainText || plainText.length < 20) {
      throw new Error("Could not extract enough text from the document");
    }

    const cvContentSha256 = cvContentSha256Hex(plainText);
    const parsed = await parseResumeWithAI(plainText);
    // The model is asked for ISO YYYY-MM-DD but isn't guaranteed to comply --
    // `date_of_birth` is a real `date` column, so an off-format value would
    // otherwise fail the whole write rather than just this one field.
    const dateOfBirth =
      parsed.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dateOfBirth)
        ? parsed.dateOfBirth
        : null;

    await withTransaction(async (tx) => {
      await updateCvDetailVersionParsingResult(tx, cvVersion.id, {
        parsingStatus: "completed",
        parsingError: null,
        parsedPayload: parsed,
        skills: parsed.skills,
        role: parsed.role,
        degree: parsed.degree,
        education: parsed.school,
        experienceYears: parsed.experienceYears,
        gpa: parsed.gpa,
        englishLevel: parsed.englishLevel,
        dateOfBirth,
        studentYears: parsed.studentYears,
        cvFileSha256,
        cvContentSha256,
      });
      await syncCandidateAggregateFields(tx, campaignApplied.candidate_id);
    });

    return { ok: true, skipped: false };
  } catch (e) {
    const msg = isUniqueViolation(e)
      ? "Another candidate profile already uses this email or phone number. Check for duplicates before retrying."
      : e instanceof Error
        ? e.message
        : String(e);
    await updateCvDetailVersionParsingResult(db, cvVersion.id, {
      parsingStatus: "failed",
      parsingError: msg,
    });
    return { ok: false, error: msg };
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId) {
    return Response.json({ error: "Missing candidate id" }, { status: 400 });
  }

  const auth = await requireAdminForRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const parseResult = await runCvParsing(campaignAppliedId);
  if (!parseResult.ok) {
    return Response.json({ error: parseResult.error }, { status: 500 });
  }

  const jdMatch = await runJdMatchForCandidate(campaignAppliedId);
  if (process.env.NODE_ENV === "development" && !jdMatch.ok) {
    console.warn("[jd-match]", campaignAppliedId, jdMatch);
  }

  let duplicateCandidates: DuplicateCandidateHit[] = [];
  let duplicateNewUpload: DuplicateNewUploadPreview | null = null;

  const db = getPool();
  const currentRow = await getCampaignAppliedAdminRowById(db, campaignAppliedId);

  if (currentRow) {
    const activeVersion = currentRow.active_cv_version_id
      ? await getCvDetailVersionById(db, currentRow.active_cv_version_id)
      : null;
    const currentDedupe: CandidateDedupeRow = {
      id: campaignAppliedId,
      name: currentRow.candidate_name,
      status: dedupeMatchStatusLabel(currentRow),
      job_opening_id: currentRow.job_id,
      job_opening_title: currentRow.job_position,
      cv_uploaded_at: activeVersion?.created_at.toISOString() ?? currentRow.created_at.toISOString(),
      created_at: currentRow.created_at.toISOString(),
      parsed_payload: activeVersion?.parsed_payload ?? {},
      cv_file_sha256: activeVersion?.cv_file_sha256 ?? null,
      cv_content_sha256: activeVersion?.cv_content_sha256 ?? null,
    };

    if (shouldFetchCandidatesForDedupe(currentDedupe)) {
      const contact = parsedContactFromPayload(currentDedupe.parsed_payload);
      const matches = await findCandidatesByDedupeSignals(db, {
        email: contact.email,
        phoneVariants: contact.phoneVariants,
        cvFileSha256: currentDedupe.cv_file_sha256,
        cvContentSha256: currentDedupe.cv_content_sha256,
      }, campaignAppliedId);

      const others: CandidateDedupeRow[] = matches.map((m) => ({
        id: m.campaign_applied_id,
        name: m.candidate_name,
        status: dedupeMatchStatusLabel(m),
        job_opening_id: m.job_id,
        job_opening_title: m.job_position,
        cv_uploaded_at: m.cv_created_at ? m.cv_created_at.toISOString() : m.created_at.toISOString(),
        created_at: m.created_at.toISOString(),
        parsed_payload: { email: m.candidate_email, phone: m.candidate_phone, role: m.cv_role },
        cv_file_sha256: m.cv_file_sha256,
        cv_content_sha256: m.cv_content_sha256,
      }));

      duplicateCandidates = findDuplicateCandidateHits(currentDedupe, others);
    }

    if (duplicateCandidates.length > 0) {
      duplicateNewUpload = duplicateNewUploadPreviewFromRow(currentDedupe);
    }
  }

  const base = parseResult.skipped
    ? { ok: true, skipped: true, reason: parseResult.reason }
    : { ok: true };

  return Response.json({
    ...base,
    duplicateCandidates,
    duplicateNewUpload,
    jdMatch: jdMatch.ok
      ? jdMatch.skipped
        ? { skipped: true, reason: jdMatch.reason }
        : { skipped: false, score: jdMatch.score }
      : { error: jdMatch.error },
  });
}
