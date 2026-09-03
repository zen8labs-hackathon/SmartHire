import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { MAX_BATCH_FILES } from "@/lib/candidates/upload-constants";

import { getPool } from "@/lib/db/config/client";
import {
  FILE_UPLOAD_ERROR_STAGE,
  FILE_UPLOAD_STATUS,
  getFileUploadsByIds,
  updateManyFileUploadStatus,
  type FileUploadRow,
} from "@/lib/db/upload-history";
import { logApiError } from "@/lib/logger";
import { fileUploadQueue } from "@/lib/queue/file-upload.queue";

type Body = {
  ids?: string[];
  jobId?: string | null;
};

export type RetryResult =
  | { id: string; ok: true }
  | { id: string; ok: false; error: string };

export async function POST(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const jobId = typeof body.jobId === "string" ? body.jobId.trim() : null;

  const ids = Array.isArray(body.ids)
    ? [
        ...new Set(
          body.ids.filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          ),
        ),
      ]
    : [];
  if (ids.length === 0) {
    return Response.json({ error: "No ids provided." }, { status: 400 });
  }
  if (ids.length > MAX_BATCH_FILES) {
    return Response.json(
      { error: `A batch is limited to ${MAX_BATCH_FILES} files.` },
      { status: 400 },
    );
  }

  const db = getPool();

  const uploads = await getFileUploadsByIds(db, ids);
  const uploadById = new Map(uploads.map((u) => [u.id, u]));

  const results = new Map<string, RetryResult>();
  const eligible: FileUploadRow[] = [];
  for (const id of ids) {
    const upload = uploadById.get(id);
    if (!upload) {
      results.set(id, { id, ok: false, error: "Upload data not found." });
    } else if (upload.status === FILE_UPLOAD_STATUS.Processing) {
      results.set(id, {
        id,
        ok: false,
        error: "Upload data is already being processed.",
      });
    } else {
      eligible.push(upload);
    }
  }

  /*   add deduplication jobs using Throttle mode strategy when add job to queue
  use priority 2 to ensure that the job is processed in a timely manner
  but not at the expense of other higher-priority jobs */
  const enqueueOutcomes = await Promise.all(
    eligible.map(async (upload) => {
      try {
        await fileUploadQueue.add(
          // Job-less rows belong to the unassigned candidate pool -- no JD to
          // match, so re-enqueue them as `upload-candidate`, same as their
          // original enqueue.
          upload.job_id ? "upload-cv" : "upload-candidate",
          {
            fileUploadId: upload.id,
          },
          {
            deduplication: {
              id: `cv-${upload.id}-${jobId || "candidate"}`,
            },
            priority: 2,
          },
        );
        return { id: upload.id, ok: true as const };
      } catch (e) {
        logApiError("Upload-files retry: queue add failed", e, {
          fileUploadId: upload.id,
          storageKey: upload.storage_key,
        });
        return { id: upload.id, ok: false as const };
      }
    }),
  );

  const enqueueFailedIds = enqueueOutcomes
    .filter((o) => !o.ok)
    .map((o) => o.id);
  if (enqueueFailedIds.length > 0) {
    await updateManyFileUploadStatus(db, enqueueFailedIds, {
      status: FILE_UPLOAD_STATUS.Failed,
      errorCode: 500,
      errorMessage: "Failed to enqueue file for processing.",
      errorStage: FILE_UPLOAD_ERROR_STAGE.Queue,
    });
    for (const id of enqueueFailedIds) {
      results.set(id, {
        id,
        ok: false,
        error: "Failed to enqueue file for processing.",
      });
    }
  }

  const enqueueSucceededIds = enqueueOutcomes
    .filter((o) => o.ok)
    .map((o) => o.id);
  if (enqueueSucceededIds.length > 0) {
    // Reset to pending right away so the UI stops showing the previous
    // failure while the row waits in queue -- the worker flips it to
    // `processing` once it actually picks the job up.
    await updateManyFileUploadStatus(db, enqueueSucceededIds, {
      status: FILE_UPLOAD_STATUS.Pending,
      errorCode: null,
      errorMessage: null,
      errorStage: null,
    });
  }

  for (const o of enqueueOutcomes) {
    if (o.ok) results.set(o.id, { id: o.id, ok: true });
  }

  return Response.json({ results: ids.map((id) => results.get(id)!) });
}
