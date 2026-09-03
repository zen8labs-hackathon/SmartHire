import type { QueryExecutor } from "@/lib/db/config/client";

export type BatchDoneRow = {
  id: string;
  is_done: boolean;
  done_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

/** Tracking row for a new upload batch -- `is_done = false` until the worker
 * confirms every file in the batch has settled. */
export async function createBatchDone(
  db: QueryExecutor,
  batchId: string,
): Promise<BatchDoneRow> {
  const { rows } = await db.query<BatchDoneRow>(
    `INSERT INTO batch_done (id, is_done, done_at)
     VALUES ($1, false, NULL)
     RETURNING id, is_done, done_at, created_at, updated_at`,
    [batchId],
  );
  return rows[0];
}

/** Flips `is_done` false -> true. Guarded by `is_done = false` so only the
 * first caller to settle the batch wins -- concurrent workers racing on the
 * same batch's last file get `null` back instead of double-firing. */
export async function markBatchDone(
  db: QueryExecutor,
  batchId: string,
): Promise<BatchDoneRow | null> {
  const { rows } = await db.query<BatchDoneRow>(
    `UPDATE batch_done
     SET is_done = true, done_at = now()
     WHERE id = $1 AND is_done = false
     RETURNING id, is_done, done_at, created_at, updated_at`,
    [batchId],
  );
  return rows[0] ?? null;
}
