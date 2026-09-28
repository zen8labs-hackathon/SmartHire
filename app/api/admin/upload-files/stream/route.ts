import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { getPool } from "@/lib/db/config/client";
import {
  getFileUploadsFingerprint,
  listFileUploads,
} from "@/lib/db/upload-history";
import { logApiError } from "@/lib/logger";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same cap the upload-history panel used when it fetched the list itself. */
const SNAPSHOT_LIMIT = 500;
const CHECK_INTERVAL_MS = 2_000;
const HEARTBEAT_MS = 15_000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * SSE feed of one upload-history scope (`?jobId=` for a job, omitted for the
 * job-less candidate pool). Replaces the panel's client-side polling.
 *   event: snapshot   -> { rows: FileUploadRow[] } on connect, then again
 *                        whenever the scope's fingerprint changes
 *   event: load-error -> { error } when the initial snapshot fails
 *   ": ping"          -> heartbeat every 15s so proxies don't drop idle connections
 *
 * `file_uploads` is written from many places (worker, retry/enqueue/manual
 * routes), so rather than wiring a push into each, the stream checks a cheap
 * count + max(updated_at) fingerprint server-side and only re-reads and
 * sends the list when it moved. EventSource reconnects on drop and gets a
 * fresh snapshot, so nothing is missed.
 */
export async function GET(request: NextRequest) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const jobIdParam = request.nextUrl.searchParams.get("jobId")?.trim() || null;
  if (jobIdParam && !UUID_RE.test(jobIdParam)) {
    return Response.json({ error: "Invalid job id." }, { status: 400 });
  }
  const scope = { jobId: jobIdParam };

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let checkTimer: ReturnType<typeof setTimeout> | null = null;
      let lastFingerprint: string | null = null;

      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // controller already closed (client vanished between the guard and here)
        }
      };
      const send = (event: string, data: unknown) =>
        write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      const db = getPool();

      // Fingerprint is read BEFORE the list so a write landing in between
      // makes the next check differ and re-send, rather than being missed.
      const sendSnapshotIfChanged = async () => {
        const fingerprint = await getFileUploadsFingerprint(db, scope);
        if (fingerprint === lastFingerprint) return;
        const { rows } = await listFileUploads(db, {
          limit: SNAPSHOT_LIMIT,
          ...(scope.jobId ? { jobId: scope.jobId } : { jobIsNull: true }),
        });
        lastFingerprint = fingerprint;
        send("snapshot", { rows });
      };

      // 1) Initial snapshot.
      try {
        await sendSnapshotIfChanged();
      } catch (e) {
        logApiError("Upload-files stream: initial snapshot failed", e, scope);
        send("load-error", { error: "Could not load upload history." });
      }

      // 2) Change checks -- chained timeouts so a slow query never overlaps the next.
      const scheduleCheck = () => {
        if (closed) return;
        checkTimer = setTimeout(async () => {
          try {
            await sendSnapshotIfChanged();
          } catch (e) {
            // Transient DB error: keep the stream open, retry next tick.
            logApiError("Upload-files stream: change check failed", e, scope);
          }
          scheduleCheck();
        }, CHECK_INTERVAL_MS);
      };
      scheduleCheck();

      // 3) Heartbeat.
      const heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);

      // 4) Teardown when the client disconnects.
      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        if (checkTimer) clearTimeout(checkTimer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      request.signal.addEventListener("abort", cleanup);
      if (request.signal.aborted) cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // don't let nginx buffer the stream
    },
  });
}
