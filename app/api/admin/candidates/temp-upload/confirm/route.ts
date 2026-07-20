import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { runDedupePrecheck } from "@/lib/candidates/check-duplicate-precheck";
import { cvContentSha256Hex, cvFileSha256Hex } from "@/lib/candidates/cv-hash";
import { extractContactFromText } from "@/lib/candidates/regex-contact-extraction";
import { CV_KEY_PREFIX, CV_TEMP_KEY_PREFIX } from "@/lib/candidates/upload-constants";
import {
  validateCvUploadRequest,
  type CvUploadRequestBody,
} from "@/lib/candidates/upload-request-validation";
import { createApplicationWithInitialCv } from "@/lib/db/campaign-applied";
import { createCandidate } from "@/lib/db/candidates";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { isUniqueViolation } from "@/lib/db/query-helpers";
import { extractTextFromBuffer } from "@/lib/jd/extract-document-text";
import { downloadObject, moveObject } from "@/lib/storage/s3";
import { buildStorageFilename } from "@/lib/storage/storage-key";

type Body = CvUploadRequestBody & {
  tempKey?: string;
  email?: string | null;
  phone?: string | null;
  /** Manually-entered basic-info field (CV9X7R follow-up) -- optional, left
   * null to let AI parsing fill it in. Mirrors email/phone's "manual input
   * always wins" precedent (see `process/route.ts`). */
  name?: string | null;
  /** True only when this confirm came from the review sub-modal's own
   * Confirm button (the user saw the prefilled email/phone/name, even if
   * left unchanged) -- as opposed to the skip-review quick-confirm/bulk-
   * confirm path in `add-candidate-modal.tsx`, which only ever has the
   * unverified client-side heuristic guess for these fields. Gates whether
   * `process/route.ts`'s AI parse is allowed to override email/phone/name:
   * unset/false means "hand basic-info fully over to AI". */
  basicInfoReviewed?: boolean;
  /** Set when the user already saw the duplicate warning (a prior 409 from
   * this route) and chose "Update CV" -- skips the dedupe block so the row
   * can be created and then merged/linked via the existing
   * link-to-candidate/update-with-history flow, mirroring how `sign-upload`
   * never blocked on dedupe either. */
  bypassDuplicateCheck?: boolean;
};

function trimOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Confirms a temp-uploaded CV: re-derives contact info + hashes server-side,
 * runs dedupe against the *confirmed* (manual-input-wins) email/phone before
 * any row exists, and only then atomically creates the candidate/application/
 * CV-version rows and moves the object to its final key. AI parsing
 * (`POST .../[id]/process`) is only reachable once `campaignAppliedId` exists
 * from this response -- no separate "confirmed" flag needed.
 */
export async function POST(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tempKey = typeof body.tempKey === "string" ? body.tempKey : "";
  if (!tempKey || !tempKey.startsWith(CV_TEMP_KEY_PREFIX)) {
    return Response.json({ error: "Invalid or missing temp upload key." }, { status: 400 });
  }

  const validated = await validateCvUploadRequest(getPool(), body);
  if (!validated.ok) {
    return Response.json({ error: validated.error }, { status: validated.status });
  }
  const { filename, ext, baseName, jobId, source, sourceOther, expectedSalary, mimeType } =
    validated.value;

  let bytes;
  try {
    bytes = await downloadObject(tempKey);
  } catch {
    return Response.json(
      { error: "Upload not found or expired. Please re-upload the file." },
      { status: 400 },
    );
  }

  const cvFileSha256 = cvFileSha256Hex(bytes);

  let plainText = "";
  try {
    plainText = await extractTextFromBuffer(bytes, mimeType || "application/octet-stream");
  } catch {
    // Fall back to manual-only contact resolution below -- extraction
    // failures shouldn't block confirmation when the user already typed the
    // basic fields in by hand.
  }
  const cvContentSha256 = cvContentSha256Hex(plainText);
  const heuristic = extractContactFromText(plainText);

  // Manual input always wins over the heuristic guess.
  const email = trimOrNull(body.email) ?? heuristic.email;
  const phone = trimOrNull(body.phone) ?? heuristic.phone;
  // No server-side heuristic for name -- manually-typed (or client-side
  // font-size guess) only, left null for AI parsing to fill in later if the
  // user skipped it.
  const name = trimOrNull(body.name);

  if (!body.bypassDuplicateCheck) {
    const { duplicateCandidates, duplicateNewUpload } = await runDedupePrecheck(getPool(), {
      email,
      phone,
      cvFileSha256,
      cvContentSha256,
    });
    if (duplicateCandidates.length > 0) {
      return Response.json({ duplicateCandidates, duplicateNewUpload }, { status: 409 });
    }
  }

  let application, cvVersion;
  try {
    ({ application, cvVersion } = await withTransaction(async (db) => {
      // A bypassed confirm means email/phone are already known to belong to
      // an existing candidate (that's *why* the dedupe check was skipped) --
      // creating this throwaway candidate row with those values would hit
      // the partial unique index on candidates(email)/candidates(phone).
      // Leave it blank; the caller immediately merges/links this application
      // into the existing person and this row is deleted or never touched.
      const candidate = await createCandidate(
        db,
        body.bypassDuplicateCheck ? {} : { email, phone, name },
      );
      return createApplicationWithInitialCv(db, {
        candidateId: candidate.id,
        jobId,
        source,
        sourceOther,
        expectedSalary,
        cv: {
          sourceEvent: "initial_upload",
          buildCvStoragePath: (applicationId) =>
            `${CV_KEY_PREFIX}${candidate.id}/${applicationId}/${buildStorageFilename(baseName, ext)}`,
          originalFilename: filename,
          mimeType,
          parsingStatus: "pending",
          cvFileSha256,
          cvContentSha256,
          parsedPayload: {
            email,
            phone,
            name,
            basicInfoReviewed: body.basicInfoReviewed === true,
          },
          createdBy: auth.userId,
        },
      });
    }));
  } catch (e) {
    if (isUniqueViolation(e)) {
      return Response.json(
        {
          error:
            "Another upload just claimed this email or phone number. Refresh and check for duplicates.",
        },
        { status: 409 },
      );
    }
    const message = e instanceof Error ? e.message : "Could not create candidate record.";
    return Response.json({ error: message }, { status: 500 });
  }

  const storagePath = cvVersion.cv_storage_path!;

  try {
    await moveObject(tempKey, storagePath);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not move the uploaded file to its final location.";
    // The DB row already exists and points at `storagePath` -- this is a
    // known reconciliation gap (see CV9X7R vault notes): no auto-retry job
    // exists yet, orphan/incomplete-move handling is deferred to future
    // cron/queue infra, not built here.
    return Response.json(
      {
        error: `Candidate record was created, but the file failed to move to its final location: ${message}`,
      },
      { status: 500 },
    );
  }

  return Response.json({
    campaignAppliedId: application.id,
    cvVersionId: cvVersion.id,
    storagePath,
  });
}
