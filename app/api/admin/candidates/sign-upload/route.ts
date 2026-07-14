import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { isCandidateSource } from "@/lib/candidates/source-constants";
import {
  extensionFromFilename,
  isAllowedCvFilename,
  MAX_CV_BYTES,
} from "@/lib/candidates/upload-constants";
import { createCandidate } from "@/lib/db/candidates";
import { createApplicationWithInitialCv } from "@/lib/db/campaign-applied";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { getJobById } from "@/lib/db/jobs";
import { createSignedUploadUrl } from "@/lib/storage/s3";
import { buildStorageFilename } from "@/lib/storage/storage-key";

type Body = {
  jobId?: string | null;
  filename?: string;
  mimeType?: string | null;
  source?: string;
  sourceOther?: string | null;
  expectedSalary?: string | null;
};

const MAX_SOURCE_OTHER_LEN = 500;
const MAX_EXPECTED_SALARY_LEN = 200;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CV_KEY_PREFIX = "cv/";

/**
 * Creates the person (`candidates`), application (`campaign_applied`), and
 * initial CV version (`cv_detail_versions`) rows, then returns a presigned S3
 * PUT URL for the actual file -- signed URL is issued last so a DB failure
 * never leaves an orphaned upload target (unlike the old code's
 * insert-then-compensating-delete dance).
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

  const filename = typeof body.filename === "string" ? body.filename.trim() : "";
  if (!filename || !isAllowedCvFilename(filename)) {
    return Response.json(
      { error: "Only .pdf and .docx files are allowed." },
      { status: 400 },
    );
  }

  const ext = extensionFromFilename(filename)!;
  const baseName = filename.slice(0, filename.length - ext.length);
  const jobId =
    typeof body.jobId === "string" && body.jobId.length > 0 ? body.jobId : null;

  if (!jobId) {
    return Response.json(
      { error: "Select a target campaign before uploading." },
      { status: 400 },
    );
  }
  if (!UUID_RE.test(jobId)) {
    return Response.json({ error: "Invalid job id." }, { status: 400 });
  }

  const sourceRaw = typeof body.source === "string" ? body.source.trim() : "";
  if (!sourceRaw || !isCandidateSource(sourceRaw)) {
    return Response.json(
      { error: "Select a valid candidate source." },
      { status: 400 },
    );
  }

  let sourceOther: string | null = null;
  if (sourceRaw === "Other") {
    const detail =
      typeof body.sourceOther === "string" ? body.sourceOther.trim() : "";
    if (!detail) {
      return Response.json(
        { error: "Please describe the source when you select Other." },
        { status: 400 },
      );
    }
    if (detail.length > MAX_SOURCE_OTHER_LEN) {
      return Response.json(
        { error: `Source description must be at most ${MAX_SOURCE_OTHER_LEN} characters.` },
        { status: 400 },
      );
    }
    sourceOther = detail;
  }

  let expectedSalary: string | null = null;
  if (typeof body.expectedSalary === "string") {
    const trimmed = body.expectedSalary.trim();
    if (trimmed.length > MAX_EXPECTED_SALARY_LEN) {
      return Response.json(
        { error: `Expected salary must be at most ${MAX_EXPECTED_SALARY_LEN} characters.` },
        { status: 400 },
      );
    }
    expectedSalary = trimmed || null;
  }

  const job = await getJobById(getPool(), jobId);
  if (!job) {
    return Response.json({ error: "Job not found." }, { status: 400 });
  }

  const mimeType = typeof body.mimeType === "string" ? body.mimeType : null;

  let application, cvVersion;
  try {
    ({ application, cvVersion } = await withTransaction(async (db) => {
      const candidate = await createCandidate(db, {});
      return createApplicationWithInitialCv(db, {
        candidateId: candidate.id,
        jobId,
        source: sourceRaw,
        sourceOther,
        expectedSalary,
        cv: {
          sourceEvent: "initial_upload",
          // Folder per candidate, per job application, mirroring the
          // candidates -> campaign_applied -> cv_detail_versions hierarchy.
          buildCvStoragePath: (applicationId) =>
            `${CV_KEY_PREFIX}${candidate.id}/${applicationId}/${buildStorageFilename(baseName, ext)}`,
          originalFilename: filename,
          mimeType,
          parsingStatus: "pending",
          createdBy: auth.userId,
        },
      });
    }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create candidate record.";
    return Response.json({ error: message }, { status: 500 });
  }

  // Always set by buildCvStoragePath above -- never left null by this flow.
  const storagePath = cvVersion.cv_storage_path!;

  try {
    const signedUrl = await createSignedUploadUrl(storagePath, mimeType);
    return Response.json({
      candidateId: application.id,
      path: storagePath,
      signedUrl,
      maxBytes: MAX_CV_BYTES,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create signed upload URL.";
    return Response.json({ error: message }, { status: 500 });
  }
}
