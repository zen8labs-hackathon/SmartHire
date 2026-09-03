import { getPool } from "@/lib/db/client";
import {
  FILE_UPLOAD_ERROR_STAGE,
  FILE_UPLOAD_STATUS,
  getFileUploadById,
  updateFileUploadById,
} from "@/lib/db/upload-history";
import { logError, toError } from "@/lib/logger";
import { UnrecoverableError } from "bullmq";
import {
  downloadAndVerifyFile,
  markValidationFailed,
  parseFileText,
  validateAndInsertCandidateData,
} from "./actions";
import { toUnrecoverableError } from "../helper";
import { ParsedResume } from "@/lib/ai/parse-resume";
import { AIProcessService } from "@/lib/service/ai-process.service";

export async function candidateUploadProcessing(jobData: {
  fileUploadId: string;
}) {
  const db = getPool();
  const { fileUploadId } = jobData;

  const upload = await getFileUploadById(db, fileUploadId);
  if (!upload) {
    const e = new UnrecoverableError(`File upload not found: ${fileUploadId}`); // Job will not be retried, as this is a permanent error
    logError("File-upload worker: upload row not found", e, { fileUploadId });
    throw e;
  }

  //Download the uploaded file from S3 to compute and verify existence
  const bytes = await downloadAndVerifyFile(db, upload.storage_key, upload.id);

  //Parse file content to extract text
  const text = await parseFileText(db, bytes, upload.mime_type, upload.id);
  if (!text || text.trim().length === 0) {
    await markValidationFailed(
      fileUploadId,
      "Could not extract text from the file.",
      db,
    );
    const e = new Error(`File upload ${fileUploadId} has no extractable text`);
    logError("File-upload worker: no extractable text", e, { fileUploadId });
    throw toUnrecoverableError(e, "Could not extract text from the file.");
  }

  let parsedData: ParsedResume;
  try {
    parsedData = await AIProcessService.semanticParsing(text);
  } catch (e) {
    const { errorCode, errorMessage } = AIProcessService.classifyAiError(e);
    try {
      await updateFileUploadById(db, fileUploadId, {
        status: FILE_UPLOAD_STATUS.Failed,
        errorCode,
        errorMessage,
        errorStage: FILE_UPLOAD_ERROR_STAGE.AiProcessing,
      });
    } catch (err) {
      console.error("Cannot update file status:", err);
    }
    logError("File-upload worker: semantic parsing failed", toError(e), {
      fileUploadId,
    });
    // 422 (empty/invalid CV text) and 503 (LLM not configured/disabled) are deterministic for this job
    if (errorCode === 422 || errorCode === 503) {
      throw toUnrecoverableError(e, errorMessage);
    }
    throw e;
  }

  //Check duplicate by email/phone, then insert/reuse candidate + application + CV version
  const { candidateId, applicationId, cvVersionId } =
    await validateAndInsertCandidateData(db, upload, parsedData);

  return { candidateId, applicationId, cvVersionId };
}
