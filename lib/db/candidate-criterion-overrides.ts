import { createHash } from "node:crypto";

import type { QueryExecutor } from "@/lib/db/config/client";

export type OverrideVerdict = "met" | "partial" | "missing" | "unclear";

export type CriterionOverrideRow = {
  id: string;
  campaign_applied_id: string;
  requirement_key: string;
  verdict: OverrideVerdict;
  original_verdict: OverrideVerdict | null;
  reason: string | null;
  author_id: string | null;
  created_at: Date;
};

/** Stable short key for a requirement, derived from its text (rationales carry no ids). */
export function requirementKey(requirement: string): string {
  return createHash("sha1")
    .update(requirement.trim().toLowerCase().replace(/\s+/g, " "))
    .digest("hex")
    .slice(0, 12);
}

export async function listCriterionOverrides(
  db: QueryExecutor,
  campaignAppliedId: string,
): Promise<CriterionOverrideRow[]> {
  const { rows } = await db.query<CriterionOverrideRow>(
    `SELECT id::text, campaign_applied_id, requirement_key, verdict, original_verdict,
            reason, author_id, created_at
     FROM candidate_criterion_overrides
     WHERE campaign_applied_id = $1 AND deleted_at IS NULL`,
    [campaignAppliedId],
  );
  return rows;
}

export async function upsertCriterionOverride(
  db: QueryExecutor,
  input: {
    campaignAppliedId: string;
    key: string;
    verdict: OverrideVerdict;
    originalVerdict: OverrideVerdict | null;
    reason: string | null;
    authorId: string | null;
  },
): Promise<void> {
  await db.query(
    `UPDATE candidate_criterion_overrides SET deleted_at = now()
     WHERE campaign_applied_id = $1 AND requirement_key = $2 AND deleted_at IS NULL
     RETURNING id`,
    [input.campaignAppliedId, input.key],
  );
  await db.query(
    `INSERT INTO candidate_criterion_overrides
       (campaign_applied_id, requirement_key, verdict, original_verdict, reason, author_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.campaignAppliedId,
      input.key,
      input.verdict,
      input.originalVerdict,
      input.reason,
      input.authorId,
    ],
  );
}

export async function revertCriterionOverride(
  db: QueryExecutor,
  campaignAppliedId: string,
  key: string,
): Promise<boolean> {
  const { rows } = await db.query(
    `UPDATE candidate_criterion_overrides SET deleted_at = now()
     WHERE campaign_applied_id = $1 AND requirement_key = $2 AND deleted_at IS NULL
     RETURNING id`,
    [campaignAppliedId, key],
  );
  return rows.length > 0;
}
