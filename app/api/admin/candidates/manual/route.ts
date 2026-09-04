import dayjs from "dayjs";

import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import {
  insertCandidateCvVersion,
  type CandidateCvFields,
} from "@/lib/candidates/insert-candidate-cv";
import {
  CV_FOLDER_PREFIX,
  isAllowedCvFilename,
} from "@/lib/candidates/upload-constants";
import type { CampaignAppliedSource } from "@/lib/db/campaign-applied";
import { getPool } from "@/lib/db/config/client";
import {
  FILE_UPLOAD_STATUS,
  insertManyFileUploads,
  updateFileUploadById,
} from "@/lib/db/upload-history";
import { logApiError } from "@/lib/logger";
import { NextRequest } from "next/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Body = {
  jobId?: string | null;
  storageKey?: string;
  fileName?: string;
  mimeType?: string | null;
  source?: CampaignAppliedSource;
  sourceOther?: string | null;
  /** Display label for the upload-history row; falls back to the caller's
   * username server-side when blank. */
  recruiter?: string | null;
  /** How to resolve an email/phone match the caller already surfaced via
   * `POST .../manual/check-duplicate` (merge-duplicate modal). Omitted when
   * that check found nothing to resolve -- auto-detection then applies as
   * before. */
  duplicateAction?: "merge" | "create_new";
  /** Required when `duplicateAction === "merge"` -- the existing candidate
   * picked in the modal; this CV is attached to it instead of a new row. */
  mergeCandidateId?: string | null;
  candidate?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    experienceYears?: number | null;
    degree?: string | null;
    education?: string | null;
    skills?: string[];
    gpa?: string | null;
    englishLevel?: string | null;
    dateOfBirth?: string | null;
    studentYears?: string | null;
  };
};

const numberOrNull = (n: unknown): number | null =>
  typeof n === "number" && Number.isFinite(n) ? n : null;

const stringOrNull = (s: unknown): string | null =>
  typeof s === "string" && s.trim().length > 0 ? s.trim() : null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s().-]+$/;

/**
 * Type/format check for the optional candidate fields -- they are all stored
 * verbatim (no AI parsing to sanity-check them), so a typo'd email or a
 * non-numeric "years of experience" would persist silently. Mirrors the
 * client-side `validateDraft` in `manual-candidate-form.tsx`; returns the
 * first problem as a user-facing string, or `null` when the payload is sound.
 */
function candidateValidationError(
  c: NonNullable<Body["candidate"]>,
): string | null {
  const email = stringOrNull(c.email);
  if (email && !EMAIL_RE.test(email)) return "Enter a valid email address.";

  const phone = stringOrNull(c.phone);
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    if (!PHONE_RE.test(phone) || digits.length < 7 || digits.length > 15) {
      return "Enter a valid phone number (7–15 digits).";
    }
  }

  if (c.experienceYears != null) {
    const n = c.experienceYears;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 70) {
      return "Years of experience must be a number between 0 and 70.";
    }
  }

  const gpa = stringOrNull(c.gpa);
  if (gpa && !/\d/.test(gpa)) {
    return "GPA must include a numeric grade (e.g. 3.7/4.0).";
  }

  const dob = stringOrNull(c.dateOfBirth);
  if (dob) {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(dob)
      ? new Date(`${dob}T00:00:00Z`)
      : new Date(NaN);
    if (Number.isNaN(parsed.getTime())) {
      return "Date of birth is not a valid date.";
    }
    if (parsed.getTime() > Date.now()) {
      return "Date of birth cannot be in the future.";
    }
    if (parsed.getUTCFullYear() < 1900) {
      return "Date of birth year looks wrong.";
    }
  }

  return null;
}

/**
 * Manual-entry counterpart to the AI-parsing upload pipeline (BullMQ
 * `upload-cv`/`upload-candidate` jobs): the recruiter already PUT the file to
 * S3 (same `sign-urls` presigned-URL flow the auto-upload tab uses) and typed
 * every field by hand, so this writes `candidates`/`campaign_applied`/
 * `cv_detail_versions` directly and synchronously -- no queue, no AI resume
 * parsing, no JD-match scoring (even when `jobId` is set). It still records
 * one `completed` `file_uploads` row (in the same transaction) so the entry
 * shows up in the "Uploaded files" history next to auto uploads.
 */
export async function POST(request: NextRequest) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const storageKey = body.storageKey?.trim();
  const fileName = body.fileName?.trim();
  if (
    !storageKey ||
    !storageKey.startsWith(CV_FOLDER_PREFIX) ||
    storageKey.includes("..")
  ) {
    return Response.json(
      { error: "Invalid or missing storage key." },
      { status: 400 },
    );
  }
  if (!fileName || !isAllowedCvFilename(fileName)) {
    return Response.json(
      { error: "Only .pdf and .docx files are allowed." },
      { status: 400 },
    );
  }

  const name = stringOrNull(body.candidate?.name);
  if (!name) {
    return Response.json(
      { error: "Candidate name is required." },
      { status: 400 },
    );
  }

  const fieldError = candidateValidationError(body.candidate ?? {});
  if (fieldError) {
    return Response.json({ error: fieldError }, { status: 400 });
  }

  let mergeCandidateId: string | null = null;
  if (body.duplicateAction === "merge") {
    mergeCandidateId =
      typeof body.mergeCandidateId === "string" ? body.mergeCandidateId : "";
    if (!UUID_RE.test(mergeCandidateId)) {
      return Response.json(
        { error: "Invalid candidate to merge into." },
        { status: 400 },
      );
    }
  }
  const forceCreateNew = body.duplicateAction === "create_new";

  const jobId =
    typeof body.jobId === "string" && body.jobId ? body.jobId : null;

  // `uploaded_by` is always the caller's user id (never trusted from the
  // client); `recruiter` is a free-text display label -- the manual override
  // if given, else the caller's username -- exactly like the auto-upload
  // history routes.
  const recruiterOverride =
    typeof body.recruiter === "string" ? body.recruiter.trim() : "";
  const recruiter = recruiterOverride || auth.access.username || null;
  const fileSource =
    body.source === "Other"
      ? (stringOrNull(body.sourceOther) ?? "Other")
      : (body.source ?? null);

  const fields: CandidateCvFields = {
    name,
    email: stringOrNull(body.candidate?.email),
    phone: stringOrNull(body.candidate?.phone),
    role: stringOrNull(body.candidate?.role),
    experienceYears: numberOrNull(body.candidate?.experienceYears),
    degree: stringOrNull(body.candidate?.degree),
    education: stringOrNull(body.candidate?.education),
    skills: Array.isArray(body.candidate?.skills)
      ? body.candidate.skills.filter(
          (s): s is string => typeof s === "string" && s.trim().length > 0,
        )
      : [],
    gpa: stringOrNull(body.candidate?.gpa),
    englishLevel: stringOrNull(body.candidate?.englishLevel),
    dateOfBirth: stringOrNull(body.candidate?.dateOfBirth),
    studentYears: stringOrNull(body.candidate?.studentYears),
  };

  try {
    const result = await insertCandidateCvVersion(getPool(), {
      jobId,
      fields,
      cv: {
        storageKey,
        fileName,
        mimeType: body.mimeType ?? null,
        fileSha256: null,
      },
      // Manual entries never run AI JD-match, even against a job -- "skipped"
      // renders as "N/A" in the JD-match column, same as any other
      // intentionally-not-run case.
      jdMatchStatusOverride: "skipped",
      source: body.source,
      sourceOther: body.sourceOther,
      createdBy: auth.userId,
      attachToCandidateId: mergeCandidateId ?? undefined,
      forceCreateNew,
      // Manual entries skip the BullMQ queue, but still get one `file_uploads`
      // tracking row (written `completed` in the same transaction) so they
      // show up in the "Uploaded files" history alongside auto uploads, with
      // their job / recruiter / source. No `batch_done` row: that table only
      // exists to dedupe the worker's batch-finished notification, which never
      // fires for a synchronous manual insert.
      onCommitted: async (tx, committed) => {
        const batchId = `${dayjs().format("YYYYMMDDHHmmss")}${crypto
          .randomUUID()
          .replace(/-/g, "")
          .slice(0, 6)}`;
        const [fileRow] = await insertManyFileUploads(tx, jobId, batchId, [
          {
            fileName,
            storageKey,
            mimeType: body.mimeType ?? null,
            fileSource,
            recruiter,
            uploadedBy: auth.userId,
          },
        ]);
        if (fileRow) {
          await updateFileUploadById(tx, fileRow.id, {
            status: FILE_UPLOAD_STATUS.Completed,
            candidateId: committed.candidateId,
            isExisted: committed.matchedExisting,
          });
        }
      },
    });

    return Response.json(result, { status: 201 });
  } catch (e) {
    logApiError("Manual candidate entry: insert failed", e, { jobId });
    return Response.json(
      { error: "Could not save this candidate." },
      { status: 500 },
    );
  }
}
