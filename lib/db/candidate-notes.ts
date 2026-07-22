import type { QueryExecutor } from "@/lib/db/config/client";

export type CandidateNoteType = "general" | "pre_interview" | "interview";

/** HR notes, distinguished by `type`. Fully independent of the AI `jd_match_*` columns on `campaign_applied`. */
export type CandidateNoteRow = {
  id: string;
  campaign_applied_id: string;
  type: CandidateNoteType;
  author_id: string | null;
  body: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type CreateCandidateNoteInput = {
  campaignAppliedId: string;
  type: CandidateNoteType;
  body: string;
  authorId?: string | null;
};

export async function getCandidateNoteById(
  db: QueryExecutor,
  id: string,
): Promise<CandidateNoteRow | null> {
  const { rows } = await db.query<CandidateNoteRow>(
    `SELECT * FROM candidate_notes WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listCandidateNotesByCampaignApplied(
  db: QueryExecutor,
  campaignAppliedId: string,
  type?: CandidateNoteType,
): Promise<CandidateNoteRow[]> {
  const conditions = ["campaign_applied_id = $1", "deleted_at IS NULL"];
  const values: unknown[] = [campaignAppliedId];
  if (type) {
    values.push(type);
    conditions.push(`type = $${values.length}`);
  }

  const { rows } = await db.query<CandidateNoteRow>(
    `SELECT * FROM candidate_notes
     WHERE ${conditions.join(" AND ")}
     ORDER BY id DESC`,
    values,
  );
  return rows;
}

export async function createCandidateNote(
  db: QueryExecutor,
  input: CreateCandidateNoteInput,
): Promise<CandidateNoteRow> {
  const { rows } = await db.query<CandidateNoteRow>(
    `INSERT INTO candidate_notes (campaign_applied_id, type, body, author_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.campaignAppliedId, input.type, input.body, input.authorId ?? null],
  );
  return rows[0];
}

export async function updateCandidateNoteBody(
  db: QueryExecutor,
  id: string,
  body: string,
): Promise<CandidateNoteRow | null> {
  const { rows } = await db.query<CandidateNoteRow>(
    `UPDATE candidate_notes
     SET body = $2, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id, body],
  );
  return rows[0] ?? null;
}

export async function softDeleteCandidateNote(
  db: QueryExecutor,
  id: string,
): Promise<CandidateNoteRow | null> {
  const { rows } = await db.query<CandidateNoteRow>(
    `UPDATE candidate_notes
     SET deleted_at = now(), updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
}
