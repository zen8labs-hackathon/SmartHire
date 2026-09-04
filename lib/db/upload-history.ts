import type { QueryExecutor } from "@/lib/db/config/client";
import type { PaginatedResult, PaginationParams } from "@/lib/db/query-helpers";
import {
  buildSetClause,
  clampLimit,
  clampOffset,
  extractWindowTotal,
} from "@/lib/db/query-helpers";

/** `file_uploads.status` values -- keep every read/write of this column keyed off this object instead of a repeated string literal. */
export const FILE_UPLOAD_STATUS = {
  Pending: "pending",
  Processing: "processing",
  Completed: "completed",
  Failed: "failed",
} as const;

export type FileUploadStatus =
  (typeof FILE_UPLOAD_STATUS)[keyof typeof FILE_UPLOAD_STATUS];

/** Pipeline stage a failure happened in -- see the lifecycle noted on `file_uploads` in its migration. */
export const FILE_UPLOAD_ERROR_STAGE = {
  Validation: "validation",
  S3Upload: "s3_upload",
  Queue: "queue",
  S3Download: "s3_download",
  AiParsing: "ai_parsing",
  AiProcessing: "ai_processing",
  Database: "database",
} as const;

export type FileUploadErrorStage =
  (typeof FILE_UPLOAD_ERROR_STAGE)[keyof typeof FILE_UPLOAD_ERROR_STAGE];

/** One row of the Redis/BullMQ-backed upload queue's per-file tracking table (`file_uploads`). */
export type FileUploadRow = {
  id: string;
  job_id: string | null;
  candidate_id: string | null;
  batch_id: string;
  file_name: string;
  storage_key: string;
  file_hash: string;
  mime_type: string | null;
  status: FileUploadStatus;
  error_code: string | null;
  error_message: string | null;
  error_stage: FileUploadErrorStage | null;
  file_source: string | null;
  recruiter: string | null;
  uploaded_by: string | null;
  is_existed: boolean;
  created_at: Date;
  updated_at: Date;
};

const FILE_UPLOAD_COLUMNS = `
  id, job_id, candidate_id, batch_id, file_name, storage_key, file_hash, mime_type, status,
  error_code, error_message, error_stage, file_source, recruiter, uploaded_by, is_existed, created_at, updated_at
`;

const FILE_UPLOAD_PROGRESS_COLUMNS = `id, status, error_code, error_message, error_stage`;

export type NewFileUploadInput = {
  fileName: string;
  storageKey: string;
  mimeType: string | null;
  fileSource?: string | null;
  recruiter?: string | null;
  uploadedBy?: string | null;
};

/**
 * Inserts every file in a batch as one `file_uploads` row each, in a single
 * round-trip via `unnest` -- avoids N separate INSERTs (and N transactions)
 * when a bulk upload registers hundreds of files at once. Returns rows in
 * the same order as `files`.
 */
export async function insertManyFileUploads(
  db: QueryExecutor,
  jobId: string | null,
  batchId: string,
  files: NewFileUploadInput[],
): Promise<FileUploadRow[]> {
  if (files.length === 0) return [];

  const { rows } = await db.query<FileUploadRow>(
    `INSERT INTO file_uploads (batch_id, job_id, file_name, storage_key, mime_type, file_source, recruiter, uploaded_by)
     SELECT $1, $2, f.file_name, f.storage_key, f.mime_type, f.file_source, f.recruiter, f.uploaded_by
     FROM unnest($3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[])
       AS f(file_name, storage_key, mime_type, file_source, recruiter, uploaded_by)
     RETURNING ${FILE_UPLOAD_COLUMNS}`,
    [
      batchId,
      jobId,
      files.map((f) => f.fileName),
      files.map((f) => f.storageKey),
      files.map((f) => f.mimeType),
      files.map((f) => f.fileSource ?? null),
      files.map((f) => f.recruiter ?? null),
      files.map((f) => f.uploadedBy ?? null),
    ],
  );
  return rows;
}

export async function getFileUploadById(
  db: QueryExecutor,
  id: string,
): Promise<FileUploadRow | null> {
  const { rows } = await db.query<FileUploadRow>(
    `SELECT ${FILE_UPLOAD_COLUMNS} FROM file_uploads WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Batch lookup by id -- avoids an N+1 when a route needs to validate/act on many rows at once (e.g. bulk retry). */
export async function getFileUploadsByIds(
  db: QueryExecutor,
  ids: string[],
): Promise<FileUploadRow[]> {
  if (ids.length === 0) return [];

  const { rows } = await db.query<FileUploadRow>(
    `SELECT ${FILE_UPLOAD_COLUMNS} FROM file_uploads WHERE id = ANY($1::bigint[])`,
    [ids],
  );
  return rows;
}

export type FileUploadUpdate = {
  status?: FileUploadRow["status"];
  errorCode?: number | null;
  errorMessage?: string | null;
  errorStage?: FileUploadErrorStage | null;
  jobId?: string | null;
  candidateId?: string | null;
  storageKey?: string | null;
  fileName?: string | null;
  fileHash?: string | null;
  isExisted?: boolean | null;
};

/** Partial update of one row's status/error fields -- e.g. a worker marking a single job `processing` then `completed`/`failed`. */
export async function updateFileUploadById(
  db: QueryExecutor,
  id: string,
  fields: FileUploadUpdate,
): Promise<FileUploadRow | null> {
  const { clause, values } = buildSetClause(
    {
      status: fields.status,
      error_code: fields.errorCode,
      error_message: fields.errorMessage,
      error_stage: fields.errorStage,
      job_id: fields.jobId,
      candidate_id: fields.candidateId,
      file_name: fields.fileName,
      storage_key: fields.storageKey,
      file_hash: fields.fileHash,
      is_existed: fields.isExisted,
    },
    2,
  );
  if (!clause) return getFileUploadById(db, id);

  const { rows } = await db.query<FileUploadRow>(
    `UPDATE file_uploads SET ${clause} WHERE id = $1 RETURNING ${FILE_UPLOAD_COLUMNS}`,
    [id, ...values],
  );
  return rows[0] ?? null;
}

/**
 * Same status/error patch as {@link updateFileUploadById} but applied to
 * every id in one statement -- e.g. the batch-commit step flipping N rows
 * from `pending` to `processing` after all their S3 PUTs succeeded, without
 * N separate UPDATE round-trips.
 */
export async function updateManyFileUploadStatus(
  db: QueryExecutor,
  ids: string[],
  fields: FileUploadUpdate,
): Promise<FileUploadRow[]> {
  if (ids.length === 0) return [];

  const { clause, values } = buildSetClause(
    {
      status: fields.status,
      error_code: fields.errorCode,
      error_message: fields.errorMessage,
      error_stage: fields.errorStage,
    },
    2,
  );
  if (!clause) return [];

  const { rows } = await db.query<FileUploadRow>(
    `UPDATE file_uploads SET ${clause} WHERE id = ANY($1::bigint[]) RETURNING ${FILE_UPLOAD_COLUMNS}`,
    [ids, ...values],
  );
  return rows;
}

/** Status/error-only projection of a `file_uploads` row -- no file metadata, for cheap progress polling. */
export type FileUploadProgressRow = Pick<
  FileUploadRow,
  "id" | "status" | "error_code" | "error_message" | "error_stage"
>;

/** Every row's progress for one batch, unpaginated -- e.g. a batch-detail view polling completion. */
export async function listFileUploadsByBatchId(
  db: QueryExecutor,
  batchId: string,
): Promise<FileUploadProgressRow[]> {
  const { rows } = await db.query<FileUploadProgressRow>(
    `SELECT ${FILE_UPLOAD_PROGRESS_COLUMNS} FROM file_uploads
     WHERE batch_id = $1
     ORDER BY created_at ASC, id ASC`,
    [batchId],
  );
  return rows;
}

export type ListFileUploadsFilters = PaginationParams & {
  batchId?: string;
  status?: FileUploadRow["status"];
  jobId?: string;
  jobIsNull?: boolean;
  /** Case-insensitive substring match against `file_name`. */
  q?: string;
};

/** Paginated, filterable list over `file_uploads` -- backs the upload-history admin view. */
export async function listFileUploads(
  db: QueryExecutor,
  filters: ListFileUploadsFilters = {},
): Promise<PaginatedResult<FileUploadRow>> {
  const limit = clampLimit(filters.limit);
  const offset = clampOffset(filters.offset);

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.batchId) {
    values.push(filters.batchId);
    conditions.push(`batch_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }
  if (filters.jobId) {
    values.push(filters.jobId);
    conditions.push(`job_id = $${values.length}`);
  } else if (filters.jobIsNull) {
    conditions.push(`job_id IS NULL`);
  }
  if (filters.q) {
    values.push(`%${filters.q}%`);
    conditions.push(`file_name ILIKE $${values.length}`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  values.push(limit);
  const limitIdx = values.length;
  values.push(offset);
  const offsetIdx = values.length;

  const { rows } = await db.query<FileUploadRow & { total_count: string }>(
    `SELECT ${FILE_UPLOAD_COLUMNS}, count(*) OVER() AS total_count
     FROM file_uploads
     ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    values,
  );

  return {
    rows: rows.map(({ total_count: _total_count, ...row }) => row),
    total: extractWindowTotal(rows),
    limit,
    offset,
  };
}

/** Per-status row counts for one batch. */
export type BatchStatusCounts = {
  total: number;
  completed: number;
  failed: number;
  /** Rows still `pending` or `processing`. */
  inProgress: number;
};

/**
 * Aggregates the `status` column across every row that shares the batch of the
 * given `file_uploads` row -- one round-trip, resolving the batch id inline.
 * Returns `null` when `fileUploadId` doesn't exist.
 */
export async function getBatchStatusCountsByFileUploadId(
  db: QueryExecutor,
  fileUploadId: string,
): Promise<BatchStatusCounts | null> {
  const { rows } = await db.query<{
    total: string;
    completed: string;
    failed: string;
    in_progress: string;
  }>(
    `SELECT
       count(*) AS total,
       count(*) FILTER (WHERE status = $2) AS completed,
       count(*) FILTER (WHERE status = $3) AS failed,
       count(*) FILTER (WHERE status IN ($4, $5)) AS in_progress
     FROM file_uploads
     WHERE batch_id = (SELECT batch_id FROM file_uploads WHERE id = $1)`,
    [
      fileUploadId,
      FILE_UPLOAD_STATUS.Completed,
      FILE_UPLOAD_STATUS.Failed,
      FILE_UPLOAD_STATUS.Pending,
      FILE_UPLOAD_STATUS.Processing,
    ],
  );

  const row = rows[0];
  if (!row || Number(row.total) === 0) return null;

  return {
    total: Number(row.total),
    completed: Number(row.completed),
    failed: Number(row.failed),
    inProgress: Number(row.in_progress),
  };
}

export async function checkIsUploadingByJobId(
  db: QueryExecutor,
  jobId: string,
  latestId: string,
): Promise<boolean> {
  const { rows } = await db.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM file_uploads
       WHERE job_id = $1 AND status IN ($2, $3)
     ) AS exists`,
    [jobId, FILE_UPLOAD_STATUS.Pending, FILE_UPLOAD_STATUS.Processing],
  );
  return rows[0]?.exists ?? false;
}
