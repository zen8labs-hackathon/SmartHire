import type { HybridJdMatchResult } from "@/lib/ai/jd-cv-match";
import { canonicalizeCandidateName } from "@/lib/candidates/candidate-display";
import { parsedContactFromPayload } from "@/lib/candidates/duplicate-detection";
import { aiWeightFromEnv } from "@/lib/candidates/jd-match-formula";
import { getCachedJobPipelineConfig } from "@/lib/candidates/resolve-application-stage";
import {
  getOrCreateCampaignApplied,
  updateCampaignApplied,
  type CampaignAppliedSource,
} from "@/lib/db/campaign-applied";
import {
  createCandidate,
  findCandidatesByContact,
  getCandidateById,
  syncCandidateFieldsFromLatestCv,
} from "@/lib/db/candidates";
import type { QueryExecutor } from "@/lib/db/config/client";
import { withTransaction } from "@/lib/db/config/client";
import {
  createCvDetailVersion,
  getNextCvVersionNumber,
} from "@/lib/db/cv-detail-versions";
import { getGlobalLlmModelId, parseLlmProviderId } from "@/lib/llm/config";
import { resolveCandidatePipelineIds } from "@/lib/pipelines/transition-validator";

/** Candidate/CV fields shared by both write paths -- AI-parsed resume output
 * on the auto-upload path, recruiter-typed input on the manual-entry path. */
export type CandidateCvFields = {
  name: string | null;
  email: string | null;
  phone: string | null;
  degree: string | null;
  education: string | null;
  role: string | null;
  experienceYears: number | null;
  skills: string[];
  gpa: string | null;
  englishLevel: string | null;
  /** `YYYY-MM-DD`, or anything else (treated as absent). */
  dateOfBirth: string | null;
  studentYears: string | null;
};

export type CvFileMeta = {
  storageKey: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSha256: string | null;
};

export type InsertCandidateCvVersionResult = {
  candidateId: string;
  applicationId: string;
  cvVersionId: string;
  /** True when this CV was attached to an already-existing candidate
   * (matched by email/phone) instead of creating a brand-new one. */
  matchedExisting: boolean;
};

export type InsertCandidateCvVersionParams = {
  jobId: string | null;
  fields: CandidateCvFields;
  cv: CvFileMeta;
  jdMatchResult?: HybridJdMatchResult;
  /** Explicit `cv_detail_versions.jd_match_status` when no `jdMatchResult` is
   * given -- e.g. `"skipped"` for a manual entry that intentionally never
   * runs AI JD-match, even against a job. Omitted preserves the historic
   * behavior (`null`) for job-less/pool auto-uploads. */
  jdMatchStatusOverride?: "skipped";
  source?: CampaignAppliedSource;
  sourceOther?: string | null;
  createdBy: string | null;
  /** Skip contact-based auto-detection and attach this CV directly to an
   * already-picked existing candidate -- the "merge" branch of a duplicate
   * check the caller already ran (e.g. the manual-entry form's dedupe
   * modal). Mutually exclusive with `forceCreateNew`. */
  attachToCandidateId?: string;
  /** Skip contact-based auto-detection and always create a brand-new
   * candidate row, even if the email/phone already belongs to someone else
   * -- the "save anyway" branch of a duplicate check the caller already ran. */
  forceCreateNew?: boolean;
  /** Runs inside the same transaction, right after the write succeeds --
   * lets a caller stamp related state (e.g. the file-upload worker marks its
   * `file_uploads` row) without breaking atomicity with the rest of the write. */
  onCommitted?: (
    tx: QueryExecutor,
    result: InsertCandidateCvVersionResult,
  ) => Promise<void>;
};

/**
 * Core "materialize 1 CV into candidates/campaign_applied/cv_detail_versions"
 * write. Shared by the AI-parsing worker (`workers/file-upload/actions.ts`'s
 * `validateAndInsertCandidateData`) and the manual-entry API route
 * (`app/api/admin/candidates/manual/route.ts`) -- the only difference
 * between the two callers is where `fields` comes from (AI-parsed vs
 * recruiter-typed) and whether AI JD-match ever runs.
 */
export async function insertCandidateCvVersion(
  db: QueryExecutor,
  params: InsertCandidateCvVersionParams,
): Promise<InsertCandidateCvVersionResult> {
  const { jobId, fields, cv, jdMatchResult } = params;
  const contact = parsedContactFromPayload({
    email: fields.email,
    phone: fields.phone,
  });
  const dateOfBirth =
    fields.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(fields.dateOfBirth)
      ? fields.dateOfBirth
      : null;

  return withTransaction(async (tx) => {
    let candidate: { id: string; email: string | null; phone: string | null };
    let matchedExisting: boolean;

    if (params.attachToCandidateId) {
      const existing = await getCandidateById(tx, params.attachToCandidateId);
      if (!existing) {
        throw new Error("The candidate to merge into was not found.");
      }
      candidate = {
        id: existing.id,
        email: existing.email,
        phone: existing.phone,
      };
      matchedExisting = true;
    } else {
      const existingCandidates = params.forceCreateNew
        ? []
        : await findCandidatesByContact(tx, {
            email: contact.email,
            phoneVariants: contact.phoneVariants,
          });

      const phoneVariantSet = new Set(contact.phoneVariants);
      const matchedCandidate = existingCandidates.find((c) => {
        const emailMatches = contact.email
          ? c.email?.toLowerCase() === contact.email
          : true;
        const phoneMatches =
          phoneVariantSet.size > 0
            ? phoneVariantSet.has((c.phone ?? "").replace(/\D/g, ""))
            : true;
        return emailMatches && phoneMatches;
      });

      if (matchedCandidate) {
        candidate = {
          id: matchedCandidate.id,
          email: matchedCandidate.email,
          phone: matchedCandidate.phone,
        };
      } else {
        const created = await createCandidate(tx, {
          name: canonicalizeCandidateName(fields.name),
          email: contact.email,
          phone: contact.phone,
          degree: fields.degree,
          education: fields.education,
          role: fields.role,
          experienceYears: fields.experienceYears,
          skills: fields.skills,
        });
        candidate = {
          id: created.id,
          email: created.email,
          phone: created.phone,
        };
      }
      matchedExisting = matchedCandidate != null;
    }

    const { application, created } = await getOrCreateCampaignApplied(tx, {
      candidateId: candidate.id,
      jobId,
      source: params.source,
      sourceOther: params.sourceOther,
    });

    let initialStageMappingId: string | null = null;
    let initialSubStateId: string | null = null;
    if (created && jobId) {
      const { stageMappings, subStages } = await getCachedJobPipelineConfig(
        tx,
        jobId,
      );
      const resolved = resolveCandidatePipelineIds(
        { current_job_stage_mapping_id: null, current_sub_state_id: null },
        stageMappings,
        subStages,
      );
      initialStageMappingId = resolved.stageMappingId;
      initialSubStateId = resolved.subStateId;
    }

    const versionNumber = await getNextCvVersionNumber(tx, application.id);
    const cvVersion = await createCvDetailVersion(tx, {
      campaignAppliedId: application.id,
      versionNumber,
      sourceEvent: versionNumber === 1 ? "initial_upload" : "file_replaced",
      cvStoragePath: cv.storageKey,
      originalFilename: cv.fileName,
      mimeType: cv.mimeType,
      cvFileSha256: cv.fileSha256,
      skills: fields.skills,
      role: fields.role,
      degree: fields.degree,
      education: fields.education,
      experienceYears: fields.experienceYears,
      gpa: fields.gpa,
      englishLevel: fields.englishLevel,
      dateOfBirth,
      studentYears: fields.studentYears,
      parsingStatus: "completed",
      jdMatchStatus: jdMatchResult
        ? "completed"
        : (params.jdMatchStatusOverride ?? null),
      jdMatchScore: jdMatchResult?.score ?? null,
      jdMatchError: null,
      jdMatchRationale: jdMatchResult?.rationale ?? null,
      jdMatchAiScore: jdMatchResult?.aiScore ?? null,
      jdMatchFormulaScore: jdMatchResult?.formulaScore ?? null,
      jdMatchAiWeight: jdMatchResult ? aiWeightFromEnv() : null,
      jdMatchModel: jdMatchResult
        ? (jdMatchResult.llmMeta?.modelId ?? getGlobalLlmModelId())
        : null,
      jdMatchProvider: jdMatchResult
        ? (jdMatchResult.llmMeta?.provider ?? parseLlmProviderId())
        : null,
      createdBy: params.createdBy,
    });

    await updateCampaignApplied(tx, application.id, {
      activeCvVersionId: cvVersion.id,
      ...(initialStageMappingId
        ? {
            currentJobStageMappingId: initialStageMappingId,
            currentSubStateId: initialSubStateId,
          }
        : {}),
    });

    await syncCandidateFieldsFromLatestCv(tx, candidate.id, {
      skills: fields.skills,
      experience_years:
        fields.experienceYears != null ? String(fields.experienceYears) : null,
      role: fields.role,
      degree: fields.degree,
      education: fields.education,
    });

    const result: InsertCandidateCvVersionResult = {
      candidateId: candidate.id,
      applicationId: application.id,
      cvVersionId: cvVersion.id,
      matchedExisting,
    };

    if (params.onCommitted) await params.onCommitted(tx, result);

    return result;
  });
}
