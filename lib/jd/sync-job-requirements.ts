import { extractJobRequirements } from "@/lib/ai/extract-jd-requirements";
import { resolveJobDescriptionText } from "@/lib/candidates/resolve-job-description-text";
import { resolveJobEvaluationCriteriaText } from "@/lib/candidates/resolve-job-evaluation-criteria-text";
import { markJobApplicationsStaleForRematch } from "@/lib/db/campaign-applied";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { getJobById } from "@/lib/db/jobs";
import { replaceExtractedJobRequirements } from "@/lib/db/job-requirements";
import { isLlmInferenceConfigured } from "@/lib/llm";
import { logError, logInfo, toError } from "@/lib/logger";

export type SyncJobRequirementsResult =
  | { ok: true; count: number; staleApplications: number }
  | { ok: false; skipped: "job_gone" | "no_text" | "llm_disabled" }
  | { ok: false; error: string };

/**
 * Rebuilds a job's `job_requirements` checklist from its JD + evaluation
 * criteria, in-request.
 *
 * The extractor owns the whole list -- the rebuild replaces every row (see
 * `replaceExtractedJobRequirements`), and every application already scored
 * against the old checklist is flagged for a re-run.
 */
export async function syncJobRequirementsFromJd(
  jobId: string,
): Promise<SyncJobRequirementsResult> {
  const db = getPool();

  const job = await getJobById(db, jobId);
  if (!job) return { ok: false, skipped: "job_gone" };

  if (!isLlmInferenceConfigured()) {
    return { ok: false, skipped: "llm_disabled" };
  }

  const jdText = await resolveJobDescriptionText(jobId);
  const criteriaText = await resolveJobEvaluationCriteriaText(jobId);
  if (!jdText?.trim() && !criteriaText?.trim()) {
    return { ok: false, skipped: "no_text" };
  }

  const items = await extractJobRequirements(jdText ?? "", criteriaText);

  // An empty extraction still replaces the old checklist: the JD's requirement
  // text may genuinely have been cleared, and leaving stale rows behind would
  // score candidates against requirements the job no longer states.
  const staleApplications = await withTransaction(async (tx) => {
    await replaceExtractedJobRequirements(tx, jobId, items);
    const stale = await markJobApplicationsStaleForRematch(tx, jobId);
    return stale.length;
  });

  logInfo("Synced job requirements", {
    jobId,
    count: items.length,
    staleApplications,
  });

  return { ok: true, count: items.length, staleApplications };
}

/**
 * Same work, but never throws.
 *
 * Used by the JD/criteria save handlers, where the row has already been
 * committed by the time this runs: a failed extraction must not turn a
 * successful save into a 500. The old checklist simply stays in place until the
 * next save or a re-extract from the Requirements panel.
 */
export async function syncJobRequirementsQuietly(
  jobId: string,
): Promise<SyncJobRequirementsResult> {
  try {
    return await syncJobRequirementsFromJd(jobId);
  } catch (e) {
    logError("Job requirements sync failed", toError(e), { jobId });
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Requirement extraction failed.",
    };
  }
}
