import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { getPool } from "@/lib/db/config/client";
import {
  countUnreadNotifications,
  listNotifications,
  toNotificationEvent,
} from "@/lib/db/notifications";
import { subscribe } from "@/lib/notifications/registry";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SNAPSHOT_LIMIT = 10;
const HEARTBEAT_MS = 15_000;

/**
 * SSE feed of the caller's notifications.
 *   event: snapshot     -> { items: NotificationEvent[], unreadCount } (once, on connect)
 *   event: notification  -> NotificationEvent (live, from the in-memory registry
 *                            fed by the worker via `/api/internal/notifications/push`)
 *   ": ping"             -> heartbeat every 15s so proxies don't drop idle connections
 * The `notifications` table is the source of truth; the snapshot backfills any
 * events published while the client had no connection open.
 *
 * The registry only lives on this process -- single Next.js instance only,
 * see `lib/notifications/registry.ts`.
 */
export async function GET(request: NextRequest) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

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

      // 1) Snapshot from the DB -- covers anything missed while offline.
      try {
        const db = getPool();
        const [items, unreadCount] = await Promise.all([
          listNotifications(db, userId, { limit: SNAPSHOT_LIMIT }),
          countUnreadNotifications(db, userId),
        ]);
        send("snapshot", { items: items.map(toNotificationEvent), unreadCount });
      } catch (err) {
        console.error("[notifications/stream] snapshot failed:", err);
        send("snapshot", { items: [], unreadCount: 0 });
      }

      // 2) Live feed via in-memory registry (`pushNotification` on the worker side).
      const unsubscribe = subscribe(userId, (event) => {
        send("notification", event);
      });

      // 3) Heartbeat.
      const heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);

      // 4) Teardown when the client disconnects -- must release the Redis
      //    channel subscription or it leaks for the life of the process.
      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      request.signal.addEventListener("abort", cleanup);
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
