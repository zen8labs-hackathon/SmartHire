import type { QueryExecutor } from "@/lib/db/config/client";

export type ChapterRow = {
  id: string;
  name: string;
  created_at: Date;
};

export async function listChapters(db: QueryExecutor): Promise<ChapterRow[]> {
  const { rows } = await db.query<ChapterRow>(
    `SELECT * FROM chapters ORDER BY name ASC`,
  );
  return rows;
}

/** Returns the subset of `ids` that actually exist -- used to validate a chapter selection before writing it. */
export async function findExistingChapterIds(
  db: QueryExecutor,
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM chapters WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  return rows.map((r) => r.id);
}

export async function createChapter(
  db: QueryExecutor,
  name: string,
): Promise<ChapterRow> {
  const { rows } = await db.query<ChapterRow>(
    `INSERT INTO chapters (name) VALUES ($1) RETURNING id, name, created_at`,
    [name],
  );
  return rows[0];
}

export async function updateChapterName(
  db: QueryExecutor,
  id: string,
  name: string,
): Promise<ChapterRow | null> {
  const { rows } = await db.query<ChapterRow>(
    `UPDATE chapters SET name = $2 WHERE id = $1 RETURNING id, name, created_at`,
    [id, name],
  );
  return rows[0] ?? null;
}

/** Hard delete -- `chapters` has no `deleted_at` column. */
export async function deleteChapter(
  db: QueryExecutor,
  id: string,
): Promise<void> {
  await db.query(`DELETE FROM chapters WHERE id = $1`, [id]);
}
