import type { HybridJdMatchResult } from "@/lib/ai/jd-cv-match";
import { aiWeightFromEnv } from "@/lib/candidates/jd-match-formula";
import { getCampaignAppliedById } from "@/lib/db/campaign-applied";
import { getPool } from "@/lib/db/client";
import {
  getCvDetailVersionById,
  updateCvDetailVersionJdMatchResult,
} from "@/lib/db/cv-detail-versions";
import { getGlobalLlmModelId, parseLlmProviderId } from "@/lib/llm";
import { logError, logInfo, toError } from "@/lib/logger";
import { AIProcessService } from "@/lib/service/ai-process.service";
import { UnrecoverableError } from "bullmq";
import { toUnrecoverableError } from "../helper";
import {
  downloadAndVerifyFile,
  parseFileText,
  saveRerunJdMatchFailure,
} from "./actions";

export async function rerunAiMatching(jobData: { cvDetailVersionId: string }) {
  const db = getPool();
  const { cvDetailVersionId } = jobData;

  const cvVersion = await getCvDetailVersionById(db, cvDetailVersionId);
  if (!cvVersion) {
    throw toUnrecoverableError(
      new Error(`CV detail version not found: ${cvDetailVersionId}`),
      `CV detail version not found: ${cvDetailVersionId}`,
    );
  }

  const application = await getCampaignAppliedById(
    db,
    cvVersion.campaign_applied_id,
  );
  if (!application) {
    throw toUnrecoverableError(
      new Error(`Application not found: ${cvVersion.campaign_applied_id}`),
      `Application not found: ${cvVersion.campaign_applied_id}`,
    );
  }
  if (!application.job_id) {
    throw toUnrecoverableError(
      new Error(`Application ${application.id} has no job to match against`),
      `Application ${application.id} has no job to match against`,
    );
  }

  if (application.active_cv_version_id !== cvVersion.id) {
    logInfo("File-upload worker: rerun JD-match skipped, CV version stale", {
      cvDetailVersionId,
      applicationId: application.id,
      activeCvVersionId: application.active_cv_version_id,
    });
    return { skipped: true as const };
  }

  await updateCvDetailVersionJdMatchResult(db, cvVersion.id, {
    jdMatchStatus: "processing",
    jdMatchError: null,
  });

  let result: HybridJdMatchResult;
  try {
    // 1. Pull the CV file back from S3.
    const bytes = await downloadAndVerifyFile(db, cvVersion.cv_storage_path);

    // 2. Extract plain text.
    const text = await parseFileText(db, bytes, cvVersion.mime_type);
    if (!text || text.trim().length === 0) {
      throw toUnrecoverableError(
        new Error(`CV version ${cvDetailVersionId} has no extractable text`),
        "Could not extract text from the file.",
      );
    }

    // Re-parse the resume, then score it against the job's JD + criteria.
    const parsed = await AIProcessService.semanticParsing(text);
    result = await AIProcessService.evaluateCv(application.job_id, parsed);
  } catch (e) {
    const { errorCode, errorMessage } = AIProcessService.classifyAiError(e);
    await saveRerunJdMatchFailure(application.id, cvVersion.id, errorMessage);
    logError("File-upload worker: rerun JD-match failed", toError(e), {
      cvDetailVersionId,
    });
    // S3/text failures are already unrecoverable; 422 (no JD text / empty
    // summary) and 503 (LLM disabled) won't fix on retry either.
    if (
      e instanceof UnrecoverableError ||
      errorCode === 422 ||
      errorCode === 503
    ) {
      throw toUnrecoverableError(e, errorMessage);
    }
    throw e;
  }

  await updateCvDetailVersionJdMatchResult(db, cvDetailVersionId, {
    jdMatchStatus: "completed",
    jdMatchScore: result.score,
    jdMatchError: null,
    jdMatchRationale: result.rationale,
    jdMatchAiScore: result.aiScore,
    jdMatchFormulaScore: result.formulaScore,
    jdMatchAiWeight: aiWeightFromEnv(),
    jdMatchModel: result.llmMeta?.modelId ?? getGlobalLlmModelId(),
    jdMatchProvider: result.llmMeta?.provider ?? parseLlmProviderId(),
  });

  return { id: cvDetailVersionId };
}
