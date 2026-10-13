import { after } from "next/server";
import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionOnJob } from "@/lib/authz/require-permission";
import { getPool } from "@/lib/db/config/client";
import { getJobById, updateJob } from "@/lib/db/jobs";
import { moveObject } from "@/lib/storage/s3";
import { buildFinalJdStoragePath } from "@/lib/jd/upload-constants";
import { isTempJdKey } from "@/lib/position/create-position";
import { deriveJdState, draftNote } from "@/lib/position/jd-state";
import { processPositionJd } from "@/lib/position/process-jd";

type Ctx = { params: Promise<{ id: string }> };

/** Retry failed JD processing (same file), optionally with a replacement upload (BR-02-28). */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const db = getPool();

  const job = await getJobById(db, id);
  if (!job || job.deleted_at) {
    return Response.json({ error: "Position not found." }, { status: 404 });
  }
  const perm = await requirePermissionOnJob(auth.access, "job.manage", id);
  if (!perm.ok) return perm.response;
  if (deriveJdState(job).state === "processing") {
    return Response.json({ error: "Already processing." }, { status: 409 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    /* empty body = retry same file */
  }

  try {
    if (body.jdStoragePath != null) {
      if (!isTempJdKey(body.jdStoragePath)) {
        return Response.json({ error: "Invalid jdStoragePath." }, { status: 400 });
      }
      const filename =
        typeof body.jdOriginalFilename === "string" ? body.jdOriginalFilename : "";
      if (!filename) {
        return Response.json(
          { error: "jdOriginalFilename is required." },
          { status: 400 },
        );
      }
      const final = buildFinalJdStoragePath(id, body.jdStoragePath, filename);
      await moveObject(body.jdStoragePath, final);
      await updateJob(db, id, {
        jdStoragePath: final,
        jdOriginalFilename: filename,
        jdMimeType:
          typeof body.jdMimeType === "string" ? body.jdMimeType : undefined,
      });
    } else if (!job.jd_storage_path) {
      return Response.json({ error: "Position has no JD file." }, { status: 400 });
    }
    // Clear the failure marker and bump updated_at so the row reads as "processing" again.
    await updateJob(db, id, {
      updateNote: draftNote(),
    });
    after(() => processPositionJd(id));
    return Response.json({ ok: true }, { status: 202 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to reprocess.";
    return Response.json({ error: message }, { status: 500 });
  }
}
