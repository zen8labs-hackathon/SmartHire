import type { QueryExecutor } from "@/lib/db/config/client";

/** Public preview always goes through `preview_token`, never `id` (see `/api/public/evaluation-preview/[token]`). No `deleted_at` — `revoked_at` is the invalidation mechanism instead. */
export type CandidateEvaluationReviewRow = {
  id: string;
  campaign_applied_id: string;
  candidate_name: string;
  reviewer_notes: string;
  filled_pdf_storage_path: string;
  preview_token: string;
  expires_at: Date;
  revoked_at: Date | null;
  ai_field_mapping: unknown;
  created_by: string | null;
  created_at: Date;
};

export type CreateCandidateEvaluationReviewInput = {
  campaignAppliedId: string;
  candidateName: string;
  reviewerNotes: string;
  filledPdfStoragePath: string;
  expiresAt?: string | Date;
  aiFieldMapping?: unknown;
  createdBy?: string | null;
};

export async function getCandidateEvaluationReviewById(
  db: QueryExecutor,
  id: string,
): Promise<CandidateEvaluationReviewRow | null> {
  const { rows } = await db.query<CandidateEvaluationReviewRow>(
    `SELECT * FROM candidate_evaluation_reviews WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Returns the row regardless of expiry/revocation so the caller can distinguish "not found" from "expired" from "revoked" for the public preview page. */
export async function getCandidateEvaluationReviewByToken(
  db: QueryExecutor,
  previewToken: string,
): Promise<CandidateEvaluationReviewRow | null> {
  const { rows } = await db.query<CandidateEvaluationReviewRow>(
    `SELECT * FROM candidate_evaluation_reviews WHERE preview_token = $1`,
    [previewToken],
  );
  return rows[0] ?? null;
}

export async function listCandidateEvaluationReviewsByCampaignApplied(
  db: QueryExecutor,
  campaignAppliedId: string,
): Promise<CandidateEvaluationReviewRow[]> {
  const { rows } = await db.query<CandidateEvaluationReviewRow>(
    `SELECT * FROM candidate_evaluation_reviews
     WHERE campaign_applied_id = $1
     ORDER BY id DESC`,
    [campaignAppliedId],
  );
  return rows;
}

export async function createCandidateEvaluationReview(
  db: QueryExecutor,
  input: CreateCandidateEvaluationReviewInput,
): Promise<CandidateEvaluationReviewRow> {
  const { rows } = await db.query<CandidateEvaluationReviewRow>(
    `INSERT INTO candidate_evaluation_reviews (
       campaign_applied_id, candidate_name, reviewer_notes, filled_pdf_storage_path,
       expires_at, ai_field_mapping, created_by
     )
     VALUES ($1, $2, $3, $4, COALESCE($5, now() + interval '30 days'), COALESCE($6::jsonb, '{}'), $7)
     RETURNING *`,
    [
      input.campaignAppliedId,
      input.candidateName,
      input.reviewerNotes,
      input.filledPdfStoragePath,
      input.expiresAt ?? null,
      input.aiFieldMapping != null
        ? JSON.stringify(input.aiFieldMapping)
        : null,
      input.createdBy ?? null,
    ],
  );
  return rows[0];
}

export async function revokeCandidateEvaluationReview(
  db: QueryExecutor,
  id: string,
): Promise<CandidateEvaluationReviewRow | null> {
  const { rows } = await db.query<CandidateEvaluationReviewRow>(
    `UPDATE candidate_evaluation_reviews
     SET revoked_at = now()
     WHERE id = $1 AND revoked_at IS NULL
     RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
}
