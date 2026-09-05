import type { HybridJdMatchResult } from "@/lib/ai/jd-cv-match";
import type { ParsedResume } from "@/lib/ai/parse-resume";
import { insertCandidateCvVersion } from "@/lib/candidates/insert-candidate-cv";
import { QueryExecutor } from "@/lib/db/client";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { updateCampaignApplied } from "@/lib/db/campaign-applied";
import { updateCvDetailVersionJdMatchResult } from "@/lib/db/cv-detail-versions";
import { isConstraintViolation } from "@/lib/db/query-helpers";
import {
  FILE_UPLOAD_ERROR_STAGE,
  FILE_UPLOAD_STATUS,
  FileUploadRow,
  getBatchStatusCountsByFileUploadId,
  getFileUploadById,
  updateFileUploadById,
} from "@/lib/db/upload-history";
import { logError, toError } from "@/lib/logger";
import { fileExtractService } from "@/lib/service/file-extract.service";
import { downloadObject } from "@/lib/storage/s3";
import { toUnrecoverableError } from "@/workers/helper";
import {
  createNotification,
  NOTIFICATION_TYPE,
  toNotificationEvent,
} from "@/lib/db/notifications";
import { markBatchDone } from "@/lib/db/batch-done";
import { pushNotification } from "@/lib/notifications/http-push";
import { getJobById } from "@/lib/db/jobs";
import { getCandidateById } from "@/lib/db/candidates";

export async function updateProcessingStatus(
  fileUploadId: string,
): Promise<void> {
  try {
    await updateFileUploadById(getPool(), fileUploadId, {
      status: FILE_UPLOAD_STATUS.Processing,
    });
  } catch (err) {
    console.error("Cannot update file status:", err);
  }
}

export async function handleJobComplete(fileUploadId: string): Promise<void> {
  try {
    await updateFileUploadById(getPool(), fileUploadId, {
      status: FILE_UPLOAD_STATUS.Completed,
    });
  } catch (err) {
    console.error("Cannot update file status:", err);
  }
}

export async function handleJobFailed(fileUploadId: string): Promise<void> {
  try {
    await updateFileUploadById(getPool(), fileUploadId, {
      status: FILE_UPLOAD_STATUS.Failed,
    });
  } catch (err) {
    console.error("Cannot update file status:", err);
  }
}

export async function markValidationFailed(
  fileUploadId: string,
  errorMessage: string,
  db: QueryExecutor,
): Promise<void> {
  try {
    await updateFileUploadById(db, fileUploadId, {
      status: FILE_UPLOAD_STATUS.Failed,
      errorCode: 400,
      errorMessage,
      errorStage: FILE_UPLOAD_ERROR_STAGE.Validation,
    });
  } catch (err) {
    console.error("Cannot update file status:", err);
  }
}

export async function downloadAndVerifyFile(
  db: QueryExecutor,
  storageKey: string | null,
  fileUploadId?: string,
): Promise<Buffer> {
  if (!storageKey) {
    throw toUnrecoverableError(
      new Error("Storage key is null"),
      "Storage key is null",
    );
  }
  try {
    return await downloadObject(storageKey);
  } catch (e) {
    // No `file_uploads` row to flag when the caller isn't a file-upload job
    // (e.g. rerun-ai-matching works off a cv_detail_versions row).
    if (fileUploadId) {
      try {
        await updateFileUploadById(db, fileUploadId, {
          status: FILE_UPLOAD_STATUS.Failed,
          errorCode: 404,
          errorMessage: "File not found or expired in s3",
          errorStage: FILE_UPLOAD_ERROR_STAGE.S3Download,
        });
      } catch (err) {
        console.error("Cannot update file status:", err);
      }
    }
    logError("File-upload worker: S3 download failed", toError(e), {
      fileUploadId,
      storageKey,
    });
    throw toUnrecoverableError(
      e,
      `File not found or expired in s3: ${fileUploadId ?? storageKey}`,
    );
  }
}

// Extracts plain text from the downloaded CV bytes
export async function parseFileText(
  db: QueryExecutor,
  bytes: Buffer,
  mimeType: string | null,
  fileUploadId?: string,
): Promise<string> {
  try {
    return await fileExtractService.parseTextFromFile(bytes, mimeType ?? "");
  } catch (e) {
    // No `file_uploads` row to flag when the caller isn't a file-upload job
    // (e.g. rerun-ai-matching works off a cv_detail_versions row).
    if (fileUploadId) {
      try {
        await updateFileUploadById(db, fileUploadId, {
          status: FILE_UPLOAD_STATUS.Failed,
          errorCode: 422,
          errorMessage: "Could not extract text from the file.",
          errorStage: FILE_UPLOAD_ERROR_STAGE.AiParsing,
        });
      } catch (err) {
        console.error("Cannot update file status:", err);
      }
    }
    logError("File-upload worker: text extraction failed", toError(e), {
      fileUploadId,
    });
    throw toUnrecoverableError(
      e,
      `Could not extract text from the file: ${fileUploadId ?? "(rerun)"}`,
    );
  }
}

export async function validateAndInsertCandidateData(
  db: QueryExecutor,
  upload: FileUploadRow,
  parsedData: ParsedResume,
  jobId?: string,
  jdMatchResult?: HybridJdMatchResult,
): Promise<{
  candidateId: string;
  applicationId: string;
  cvVersionId: string;
}> {
  const dateOfBirth =
    parsedData.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(parsedData.dateOfBirth)
      ? parsedData.dateOfBirth
      : null;

  try {
    return await insertCandidateCvVersion(db, {
      jobId: jobId ?? null,
      fields: {
        name: parsedData.name,
        email: parsedData.email,
        phone: parsedData.phone,
        degree: parsedData.degree,
        education: parsedData.school,
        role: parsedData.role,
        experienceYears: parsedData.experienceYears,
        skills: parsedData.skills,
        gpa: parsedData.gpa,
        englishLevel: parsedData.englishLevel,
        dateOfBirth,
        studentYears: parsedData.studentYears,
      },
      cv: {
        storageKey: upload.storage_key,
        fileName: upload.file_name,
        mimeType: upload.mime_type,
        fileSha256: upload.file_hash,
      },
      jdMatchResult,
      createdBy: upload.uploaded_by ?? null,
      onCommitted: async (tx, result) => {
        await updateFileUploadById(tx, upload.id, {
          candidateId: result.candidateId,
          isExisted: result.matchedExisting,
        });
      },
    });
  } catch (e) {
    try {
      await updateFileUploadById(db, upload.id, {
        status: FILE_UPLOAD_STATUS.Failed,
        errorCode: 500,
        errorMessage: "Could not save candidate data for this CV.",
        errorStage: FILE_UPLOAD_ERROR_STAGE.Database,
      });
    } catch (err) {
      console.error("Cannot update file status:", err);
    }
    logError(
      "File-upload worker: candidate/application/CV version write failed",
      toError(e),
      { fileUploadId: upload.id },
    );
    // A constraint violation (unique/FK/not-null/check) is deterministic for
    // this data -- retrying the same write fails the same way. Connection
    // drops, deadlocks, and timeouts are left as retryable.
    if (isConstraintViolation(e)) {
      throw toUnrecoverableError(
        e,
        "Could not save candidate data for this CV.",
      );
    }
    throw e;
  }
}

export async function saveRerunJdMatchFailure(
  campaignAppliedId: string,
  cvVersionId: string,
  message: string,
): Promise<void> {
  const cropped = message.slice(0, 2000);
  try {
    await withTransaction(async (tx) => {
      await updateCampaignApplied(
        tx,
        campaignAppliedId,
        { jdMatchStatus: "failed", jdMatchError: cropped },
        { guardActiveCvVersionId: cvVersionId },
      );
      await updateCvDetailVersionJdMatchResult(tx, cvVersionId, {
        jdMatchStatus: "failed",
        jdMatchError: cropped,
      });
    });
  } catch (err) {
    console.error("Cannot persist JD-match failure:", err);
  }
}

/** Counts returned once a batch has fully settled. */
export type CompletedBatchResult = {
  total: number;
  completed: number;
  failed: number;
};

export async function checkCompletedBatch(
  fileUploadId: string,
): Promise<CompletedBatchResult | null> {
  const counts = await getBatchStatusCountsByFileUploadId(
    getPool(),
    fileUploadId,
  );
  if (!counts || counts.inProgress > 0) return null;

  return {
    total: counts.total,
    completed: counts.completed,
    failed: counts.failed,
  };
}

/**
 * Lưu 1 notification "batch hoàn thành" và bắn realtime tới người upload.
 * Gọi sau khi `checkCompletedBatch` xác nhận batch đã settle (tránh query lại).
 *
 * Nhiều job trong cùng batch chạy song song (worker `concurrency: 5`) có thể
 * cùng lúc thấy batch đã settle -- `markBatchDone` (CAS `WHERE is_done = false`)
 * đảm bảo chỉ đúng 1 job thắng race và được chạy notification, các job thua
 * race nhận về `null` và bỏ qua.
 */
export async function notifyBatchComplete(
  fileUploadId: string,
  batch: CompletedBatchResult,
): Promise<void> {
  const upload = await getFileUploadById(getPool(), fileUploadId);
  if (!upload?.uploaded_by) return;

  const won = await markBatchDone(getPool(), upload.batch_id);
  if (!won) return;

  try {
    // Job-less batches (unassigned candidate pool) land on `/admin/candidates`;
    // job-scoped batches have their own "Uploaded files" tab on that job's
    // pipeline page instead.
    const href = upload.job_id
      ? `/admin/jd/${upload.job_id}/pipeline?tab=uploads`
      : "/admin/candidates?tab=uploads";

    const job = upload.job_id
      ? await getJobById(getPool(), upload.job_id)
      : null;
    const target = job ? ` for "${job.position}"` : "";

    const row = await createNotification(getPool(), {
      userId: upload.uploaded_by,
      type: NOTIFICATION_TYPE.BatchComplete,
      title:
        batch.failed > 0
          ? "CV upload finished with errors"
          : "CV upload complete",
      body:
        batch.failed > 0
          ? `${batch.completed} of ${batch.total} CV(s)${target} processed successfully; ${batch.failed} failed. Open the Uploaded files tab for details.`
          : `All ${batch.total} CV(s)${target} were uploaded and processed successfully. Open the Uploaded files tab to review them.`,
      data: { batchId: upload.batch_id, ...batch, href },
    });

    await pushNotification(upload.uploaded_by, toNotificationEvent(row));
  } catch (err) {
    console.error("Cannot create/push batch-complete notification:", err);
  }
}

export async function notifyRerunAiMatchResult(
  userId: string,
  cvDetailVersionId: string,
  outcome: { ok: true } | { ok: false; message: string },
  location?: { jobId?: string; candidateId?: string },
): Promise<void> {
  try {
    const href =
      location?.jobId && location?.candidateId
        ? `/admin/jd/${location.jobId}/pipeline/${location.candidateId}`
        : null;

    const [job, candidate] = await Promise.all([
      location?.jobId ? getJobById(getPool(), location.jobId) : null,
      location?.candidateId
        ? getCandidateById(getPool(), location.candidateId)
        : null,
    ]);
    const who = candidate?.name ?? "Candidate";
    const target = job ? ` for "${job.position}"` : "";

    const row = await createNotification(getPool(), {
      userId,
      type: outcome.ok
        ? NOTIFICATION_TYPE.RerunAiMatchComplete
        : NOTIFICATION_TYPE.RerunAiMatchFailed,
      title: outcome.ok ? "AI JD-match complete" : "AI JD-match failed",
      body: outcome.ok
        ? `Updated the JD-match score for ${who}${target}. Open the candidate's profile to view it.`
        : `Could not recalculate the JD-match score for ${who}${target}: ${outcome.message}`,
      data: { cvDetailVersionId, ...(href ? { href } : {}) },
    });

    await pushNotification(userId, toNotificationEvent(row));
  } catch (err) {
    console.error("Cannot create/push rerun-ai-match notification:", err);
  }
}
