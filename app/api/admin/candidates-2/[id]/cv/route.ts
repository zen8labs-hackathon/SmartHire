import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { getCandidate2Detail } from "@/lib/db/candidates-detail2";
import {
  getOrCreateCampaignApplied,
  updateCampaignApplied,
} from "@/lib/db/campaign-applied";
import {
  createCvDetailVersion,
  getNextCvVersionNumber,
} from "@/lib/db/cv-detail-versions";
import { cvFileSha256Hex } from "@/lib/candidates/cv-hash";
import { fileSourceToApplicationSource } from "@/lib/candidates/source-constants";
import {
  CV_FOLDER_PREFIX,
  isAllowedCvFilename,
  extensionFromFilename,
  mimeTypeFromCvFilename,
} from "@/lib/candidates/upload-constants";
import { uploadObject } from "@/lib/storage/s3";
import { buildTimestampedStorageFilename } from "@/lib/storage/storage-key";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Upload a new CV for a candidate. `target` is an application id (open
 * application) or "pool". The version is created `pending`; the client then
 * triggers parsing via POST /api/admin/candidates/{applicationId}/process.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data." }, { status: 400 });
  }
  const file = form.get("file");
  const target = String(form.get("target") ?? "").trim();
  const sourceRaw = String(form.get("source") ?? "").trim();
  const sourceOther = String(form.get("sourceOther") ?? "").trim();

  if (!(file instanceof File) || !file.size) {
    return Response.json({ error: "Choose a CV file." }, { status: 400 });
  }
  if (!isAllowedCvFilename(file.name)) {
    return Response.json({ error: "Only PDF or DOCX files are accepted." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "File is larger than 10 MB." }, { status: 400 });
  }
  if (!target || (target !== "pool" && !UUID_RE.test(target))) {
    return Response.json({ error: "Choose where to attach the CV." }, { status: 400 });
  }

  try {
    const db = getPool();
    const { rows: cand } = await db.query<{ id: string; name: string | null }>(
      `SELECT id, name FROM candidates WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!cand[0]) return Response.json({ error: "Not found." }, { status: 404 });

    if (target !== "pool") {
      const { rows } = await db.query(
        `SELECT 1 FROM campaign_applied
          WHERE id = $1 AND candidate_id = $2 AND deleted_at IS NULL`,
        [target, id],
      );
      if (!rows.length) {
        return Response.json({ error: "Application not found." }, { status: 404 });
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sha = cvFileSha256Hex(buffer);
    const { rows: dup } = await db.query(
      `SELECT 1 FROM cv_detail_versions v
         JOIN campaign_applied ca ON ca.id = v.campaign_applied_id
        WHERE ca.candidate_id = $1 AND ca.deleted_at IS NULL AND v.cv_file_sha256 = $2
        LIMIT 1`,
      [id, sha],
    );
    if (dup.length) {
      return Response.json(
        { error: "This exact file is already on the candidate's profile." },
        { status: 409 },
      );
    }

    const ext = extensionFromFilename(file.name) ?? "";
    const key = `${CV_FOLDER_PREFIX}${buildTimestampedStorageFilename(cand[0].name ?? "candidate", ext)}`;
    const mimeType = mimeTypeFromCvFilename(file.name);
    await uploadObject(key, buffer, mimeType);

    const src = fileSourceToApplicationSource(sourceRaw === "Other" ? sourceOther : sourceRaw);

    const applicationId = await withTransaction(async (tx) => {
      let appId = target;
      if (target === "pool") {
        const { rows: existing } = await tx.query<{ id: string }>(
          `SELECT id FROM campaign_applied
            WHERE candidate_id = $1 AND job_id IS NULL AND deleted_at IS NULL
            ORDER BY created_at DESC LIMIT 1`,
          [id],
        );
        if (existing[0]) {
          appId = existing[0].id;
        } else {
          const { application } = await getOrCreateCampaignApplied(tx, {
            candidateId: id,
            jobId: null,
            source: src.source,
            sourceOther: src.sourceOther,
          });
          appId = application.id;
        }
      }
      const version = await createCvDetailVersion(tx, {
        campaignAppliedId: appId,
        versionNumber: await getNextCvVersionNumber(tx, appId),
        sourceEvent: "file_replaced",
        cvStoragePath: key,
        originalFilename: file.name,
        mimeType,
        cvFileSha256: sha,
        parsingStatus: "pending",
        createdBy: auth.userId,
      });
      await updateCampaignApplied(tx, appId, { activeCvVersionId: version.id });
      return appId;
    });

    const detail = await getCandidate2Detail(db, id);
    return Response.json({ ...detail, applicationId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to upload CV.";
    return Response.json({ error: message }, { status: 500 });
  }
}
