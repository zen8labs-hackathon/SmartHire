import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import {
  CV_FOLDER_PREFIX,
  extensionFromFilename,
  isAllowedCvFilename,
} from "@/lib/candidates/upload-constants";
import { createBatchDone } from "@/lib/db/batch-done";
import { getPool, withTransaction } from "@/lib/db/config/client";
import {
  FILE_UPLOAD_STATUS,
  insertManyFileUploads,
  listFileUploads,
  type FileUploadStatus,
  type NewFileUploadInput,
} from "@/lib/db/upload-history";
import { logApiError } from "@/lib/logger";
import dayjs from "dayjs";
import { NextRequest } from "next/server";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const VALID_STATUSES = new Set<string>(Object.values(FILE_UPLOAD_STATUS));

export type UploadedFile = {
  fileName?: string;
  mimeType?: string | null;
  size?: number;
  fileSource?: string | null;
};

type Body = {
  files?: UploadedFile[];
  /** Optional manual override; falls back to the caller's username server-side. */
  recruiter?: string | null;
};

type RouteContext = { params: Promise<{ jobId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  // Check if the user is authenticated and has staff privileges
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { jobId } = await params;
  if (!jobId) {
    return Response.json({ error: "Missing job id." }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const files = Array.isArray(body.files) ? body.files : [];
  if (files.length === 0) {
    return Response.json({ error: "No files provided." }, { status: 400 });
  }

  // `uploaded_by` is the caller's user id (never trusted from the client);
  // `recruiter` is a display label -- the manual override if given, else the
  // caller's username.
  const uploadedBy = auth.userId;
  const recruiterOverride =
    typeof body.recruiter === "string" ? body.recruiter.trim() : "";
  const recruiter = recruiterOverride || auth.access.username || null;

  const inputs: NewFileUploadInput[] = [];
  for (const file of files) {
    const fileName =
      typeof file.fileName === "string" ? file.fileName.trim() : "";

    if (!fileName || !isAllowedCvFilename(fileName)) {
      return Response.json(
        {
          error: `Only .pdf and .docx files are allowed: ${fileName || "(unnamed)"}`,
        },
        { status: 400 },
      );
    }
    if (typeof file.size === "number" && file.size > MAX_FILE_SIZE_BYTES) {
      return Response.json(
        { error: `${fileName} exceeds the 50 MB limit.` },
        { status: 400 },
      );
    }

    const ext = extensionFromFilename(fileName)!;
    const storageKey = `${CV_FOLDER_PREFIX}${crypto.randomUUID()}${ext}`;

    inputs.push({
      fileName,
      storageKey,
      mimeType: typeof file.mimeType === "string" ? file.mimeType : null,
      fileSource: typeof file.fileSource === "string" ? file.fileSource : null,
      recruiter,
      uploadedBy,
    });
  }

  const batchId = dayjs().format("YYYYMMDDHHmmss");

  let rows;
  try {
    rows = await withTransaction(async (tx) => {
      const inserted = await insertManyFileUploads(tx, jobId, batchId, inputs);
      await createBatchDone(tx, batchId);
      return inserted;
    });
  } catch (e) {
    logApiError("Upload-files history: insert failed", e, { jobId, batchId });
    return Response.json(
      { error: "Could not record upload batch." },
      { status: 500 },
    );
  }

  return Response.json({ jobId, batchId, files: rows }, { status: 201 });
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  // Check if the user is authenticated and has staff privileges
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { jobId } = await params;
  if (!jobId) {
    return Response.json({ error: "Missing job id." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);

  const status = searchParams.get("status") ?? undefined;
  if (status && !VALID_STATUSES.has(status)) {
    return Response.json(
      { error: `Invalid status: ${status}` },
      { status: 400 },
    );
  }

  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");

  try {
    const db = getPool();
    const result = await listFileUploads(db, {
      limit: limitParam ? Number(limitParam) : undefined,
      offset: offsetParam ? Number(offsetParam) : undefined,
      batchId: searchParams.get("batchId") ?? undefined,
      status: status as FileUploadStatus | undefined,
      jobId,
      q: searchParams.get("fileName") ?? undefined,
    });
    return Response.json(result);
  } catch (e) {
    logApiError("Upload-files history: list failed", e, { jobId });
    return Response.json(
      { error: "Could not list upload history." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  // Check if the user is authenticated and has staff privileges
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
}
