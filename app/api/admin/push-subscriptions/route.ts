import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { getPool } from "@/lib/db/config/client";
import {
  deletePushSubscriptionForUser,
  upsertPushSubscription,
} from "@/lib/db/push-subscriptions";
import { logApiError } from "@/lib/logger";
import { NextRequest } from "next/server";

/**
 * Web Push subscription registry for the signed-in staff user.
 *   POST   -> store/refresh this browser's subscription (called after the
 *             client's `pushManager.subscribe(...)` succeeds, and again on
 *             `pushsubscriptionchange`)
 *   DELETE -> drop this browser's subscription ("turn off notifications")
 *
 * The subscription shape is `PushSubscription.toJSON()` from the browser:
 * `{ endpoint, keys: { p256dh, auth } }`.
 */

type PushSubscriptionBody = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

export async function POST(request: NextRequest) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  let body: PushSubscriptionBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const authKey = body.keys?.auth;
  if (
    typeof endpoint !== "string" ||
    typeof p256dh !== "string" ||
    typeof authKey !== "string" ||
    !endpoint ||
    !p256dh ||
    !authKey
  ) {
    return Response.json(
      { error: "Missing endpoint or keys." },
      { status: 400 },
    );
  }

  try {
    await upsertPushSubscription(getPool(), {
      userId: auth.userId,
      endpoint,
      p256dh,
      auth: authKey,
      userAgent: request.headers.get("user-agent"),
    });
    return Response.json({ ok: true });
  } catch (e) {
    logApiError("Push subscription: upsert failed", e, { userId: auth.userId });
    return Response.json(
      { error: "Could not save the subscription." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  let body: { endpoint?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const endpoint = body.endpoint;
  if (typeof endpoint !== "string" || !endpoint) {
    return Response.json({ error: "Missing endpoint." }, { status: 400 });
  }

  try {
    // Idempotent: a browser that already dropped its local subscription (or
    // never had a server row) still gets a clean 200.
    await deletePushSubscriptionForUser(getPool(), auth.userId, endpoint);
    return Response.json({ ok: true });
  } catch (e) {
    logApiError("Push subscription: delete failed", e, { userId: auth.userId });
    return Response.json(
      { error: "Could not remove the subscription." },
      { status: 500 },
    );
  }
}
