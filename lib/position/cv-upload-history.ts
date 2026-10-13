import type { QueryExecutor } from "@/lib/db/config/client";

export type CvUploadKind =
  | "new"
  | "existing"
  | "dup_job"
  | "same_file"
  | "failed"
  | "processing";

export type CvUploadHistoryFile = {
  id: string;
  fileName: string;
  kind: CvUploadKind;
  candidateName: string | null;
  errorMessage: string | null;
  errorStage: string | null;
  /** Latest `campaign_applied.jd_match_score` for this job, if scored. */
  score: number | null;
  candidateId: string | null;
  errorCode: string | null;
  storageKey: string;
  mimeType: string | null;
  fileSource: string | null;
  recruiter: string | null;
  /** True while the file is still pending/processing. */
  inProgress: boolean;
  createdAt: string;
};

export type CvUploadHistoryBatch = {
  id: string;
  at: string;
  by: string;
  source: string;
  files: CvUploadHistoryFile[];
};

type Row = {
  id: string;
  batch_id: string;
  file_name: string;
  status: "pending" | "processing" | "completed" | "failed";
  is_existed: boolean;
  error_message: string | null;
  error_stage: string | null;
  file_source: string | null;
  recruiter: string | null;
  created_at: Date;
  candidate_name: string | null;
  score: number | null;
  candidate_id: string | null;
  error_code: string | null;
  storage_key: string;
  mime_type: string | null;
  dup_job: boolean;
  same_file: boolean;
};

/**
 * Upload history of one position (or the talent pool when `jobId` is null),
 * grouped by batch, newest first. Capped to the latest `limit` files.
 */
export async function listCvUploadHistory(
  db: QueryExecutor,
  jobId: string | null,
  limit = 500,
): Promise<CvUploadHistoryBatch[]> {
  const { rows } = await db.query<Row>(
    `SELECT f.id, f.batch_id, f.file_name, f.status, f.is_existed, f.error_message,
            f.error_stage, f.file_source, f.recruiter, f.created_at,
            c.name AS candidate_name, f.candidate_id, f.error_code, f.storage_key, f.mime_type,
            (f.status = 'completed' AND f.is_existed AND f.candidate_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM campaign_applied ca2
               WHERE ca2.candidate_id = f.candidate_id AND ca2.job_id IS NOT DISTINCT FROM f.job_id
                 AND ca2.created_at < f.created_at)) AS dup_job,
            (f.status = 'completed' AND COALESCE(f.file_hash, '') <> '' AND EXISTS (
              SELECT 1 FROM file_uploads g
               WHERE g.file_hash = f.file_hash AND g.job_id IS NOT DISTINCT FROM f.job_id
                 AND g.status = 'completed' AND g.id < f.id)) AS same_file,
            (SELECT ca.jd_match_score FROM campaign_applied ca
              WHERE ca.candidate_id = f.candidate_id AND ca.job_id IS NOT DISTINCT FROM f.job_id
              ORDER BY ca.created_at DESC LIMIT 1) AS score
       FROM file_uploads f
       LEFT JOIN candidates c ON c.id = f.candidate_id
      WHERE f.job_id IS NOT DISTINCT FROM $1::uuid
      ORDER BY f.created_at DESC, f.id DESC
      LIMIT $2`,
    [jobId, limit],
  );

  const batches = new Map<string, CvUploadHistoryBatch>();
  for (const r of rows) {
    let b = batches.get(r.batch_id);
    if (!b) {
      b = {
        id: r.batch_id,
        at: r.created_at.toISOString(),
        by: r.recruiter ?? "—",
        source: r.file_source ?? "—",
        files: [],
      };
      batches.set(r.batch_id, b);
    }
    b.files.push({
      id: r.id,
      fileName: r.file_name,
      kind:
        r.status === "failed"
          ? "failed"
          : r.status === "completed"
            ? r.same_file
              ? "same_file"
              : r.dup_job
                ? "dup_job"
                : r.is_existed
                  ? "existing"
                  : "new"
            : "processing",
      candidateId: r.candidate_id,
      errorCode: r.error_code,
      storageKey: r.storage_key,
      mimeType: r.mime_type,
      fileSource: r.file_source,
      recruiter: r.recruiter,
      inProgress: r.status === "pending" || r.status === "processing",
      createdAt: r.created_at.toISOString(),
      candidateName: r.candidate_name,
      errorMessage: r.error_message,
      errorStage: r.error_stage,
      score: r.score,
    });
  }
  return [...batches.values()];
}
