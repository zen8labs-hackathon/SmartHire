import { publish } from "@/lib/notifications/registry";
import { sendWebPushToUser } from "@/lib/notifications/web-push";
import type { NotificationEvent } from "@/lib/redis/channels";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Endpoint nội bộ: worker gọi vào đây để bắn 1 notification realtime tới client SSE đang mở
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-internal-secret");
  if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { userId?: string; event?: NotificationEvent };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.userId || !body.event) {
    return NextResponse.json(
      { error: "missing userId/event" },
      { status: 400 },
    );
  }

  // Open tabs -> SSE registry (this process only).
  publish(body.userId, body.event);

  // Closed tabs -> Web Push. Best-effort and self-contained (never throws);
  // awaited so it runs before the serverless function is frozen.
  await sendWebPushToUser(body.userId, body.event);

  return NextResponse.json({ ok: true });
}
