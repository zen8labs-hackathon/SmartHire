import { withTransaction } from "@/lib/db/config/client";
import { markJobApplicationsStaleForRematch } from "@/lib/db/campaign-applied";
import {
  JOB_REQUIREMENT_IMPORTANCES,
  JOB_REQUIREMENT_ORIGINS,
  listJobRequirements,
  replaceExtractedJobRequirements,
  type JobRequirementImportance,
  type JobRequirementOrigin,
  type JobRequirementRow,
  type NewJobRequirementInput,
} from "@/lib/db/job-requirements";

const MAX_CRITERIA = 100;
const MAX_REQUIREMENT_LENGTH = 500;

export type ParsedCriteria =
  | { ok: true; items: NewJobRequirementInput[] }
  | { ok: false; error: string };

/** Validates the request body's `criteria` array. */
export function parseCriteria(raw: unknown): ParsedCriteria {
  if (!Array.isArray(raw)) return { ok: false, error: "criteria must be an array." };
  if (raw.length > MAX_CRITERIA) {
    return { ok: false, error: `At most ${MAX_CRITERIA} criteria.` };
  }
  const items: NewJobRequirementInput[] = [];
  for (const entry of raw) {
    const e = entry as Record<string, unknown> | null;
    const requirement =
      typeof e?.requirement === "string" ? e.requirement.trim() : "";
    if (!requirement || requirement.length > MAX_REQUIREMENT_LENGTH) {
      return {
        ok: false,
        error: `Each criterion needs text (max ${MAX_REQUIREMENT_LENGTH} characters).`,
      };
    }
    if (!JOB_REQUIREMENT_IMPORTANCES.includes(e?.importance as JobRequirementImportance)) {
      return { ok: false, error: "Invalid importance." };
    }
    if (!JOB_REQUIREMENT_ORIGINS.includes(e?.origin as JobRequirementOrigin)) {
      return { ok: false, error: "Invalid origin." };
    }
    items.push({
      requirement,
      importance: e!.importance as JobRequirementImportance,
      origin: e!.origin as JobRequirementOrigin,
    });
  }
  return { ok: true, items };
}

/**
 * Replaces the job's scoring criteria with HR's edited list and flags
 * already-scored applications as stale. Rescoring itself is a separate,
 * deliberate action (`/rescore`).
 */
export async function savePositionCriteria(
  jobId: string,
  items: NewJobRequirementInput[],
): Promise<{ requirements: JobRequirementRow[]; staleApplications: number }> {
  return withTransaction(async (tx) => {
    await replaceExtractedJobRequirements(tx, jobId, items);
    const stale = await markJobApplicationsStaleForRematch(tx, jobId);
    const requirements = await listJobRequirements(tx, jobId);
    return { requirements, staleApplications: stale.length };
  });
}
