import { requireStaffForRequest } from "@/lib/admin/require-staff-request";

import { getPool } from "@/lib/db/config/client";
import {
  FILE_UPLOAD_ERROR_STAGE,
  FILE_UPLOAD_STATUS,
  getFileUploadById,
  updateFileUploadById,
} from "@/lib/db/upload-history";
import { logApiError } from "@/lib/logger";
import { fileUploadQueue } from "@/lib/queue/file-upload.queue";
import { NextRequest } from "next/server";

type Body = {
  jobId?: string | null;
};

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const jobId = typeof body.jobId === "string" ? body.jobId.trim() : null;

  const { id } = await params;

  const db = getPool();

  // Verify the id refers to a real, still-pending row before touching S3/the
  const upload = await getFileUploadById(db, id);
  if (!upload) {
    return Response.json({ error: "Upload data not found." }, { status: 404 });
  }
  if (upload.status === FILE_UPLOAD_STATUS.Processing) {
    return Response.json(
      { error: `Upload data is already being processed.` },
      { status: 409 },
    );
  }

  /*   add deduplication jobs using Throttle mode strategy when add job to queue
  use priority 5 to ensure that the job is processed in a timely manner
  but not at the expense of other higher-priority jobs */
  try {
    await fileUploadQueue.add(
      // A row with no job goes to the unassigned candidate pool -- there's no
      // JD to match against, so route it through `upload-candidate` instead.
      upload.job_id ? "upload-cv" : "upload-candidate",
      {
        fileUploadId: upload.id,
      },
      {
        deduplication: {
          id: `cv-${upload.id}-${jobId || "candidate"}`,
        },
        priority: 5,
      },
    );
  } catch (e) {
    logApiError("Upload-files enqueue: queue add failed", e, {
      fileUploadId: id,
    });
    try {
      await updateFileUploadById(db, id, {
        status: FILE_UPLOAD_STATUS.Failed,
        errorCode: 500,
        errorMessage: "Failed to enqueue file for processing.",
        errorStage: FILE_UPLOAD_ERROR_STAGE.Queue,
      });
    } catch (err) {
      console.error("Cannot update file status:", err);
    }
    return Response.json(
      { error: "Failed to enqueue file for processing." },
      { status: 500 },
    );
  }

  return Response.json({ fileUploadId: upload.id });
}
