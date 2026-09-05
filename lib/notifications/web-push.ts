import webpush, { WebPushError } from "web-push";

import { getPool } from "@/lib/db/config/client";
import {
  deletePushSubscriptionByEndpoint,
  listPushSubscriptionsByUserId,
  type PushSubscriptionRow,
} from "@/lib/db/push-subscriptions";
import { logApiError, logWarn } from "@/lib/logger";
import type { NotificationEvent } from "@/lib/redis/channels";

/**
 * Server-side Web Push (RFC 8291 / VAPID) sender. Pairs with the service worker
 * in `public/sw.js`, which reads the JSON payload as
 * `{ id, title, body, data }` -- so we send the whole `NotificationEvent`.
 *
 * This is the "tab closed" delivery path; the SSE stream
 * (`/api/admin/notifications/stream`) covers open tabs. Both are fed from the
 * same `NotificationEvent`, typically together from
 * `/api/internal/notifications/push`.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT;

let configured = false;

/** Wire the VAPID keys into `web-push` once. Returns false if env is missing. */
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    logWarn(
      "[web-push] disabled: missing NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT",
    );
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

/** True once the VAPID env is present -- callers can skip the DB read otherwise. */
export function isWebPushConfigured(): boolean {
  return ensureConfigured();
}

function toWebPushSubscription(row: PushSubscriptionRow) {
  return {
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  };
}

/**
 * Pushes one `NotificationEvent` to every browser `userId` has opted in on.
 * Best-effort: failures are logged, never thrown. A `404`/`410` from the push
 * service means the subscription is dead -- we delete it so it stops being
 * retried. Returns how many pushes the service accepted.
 */
export async function sendWebPushToUser(
  userId: string,
  event: NotificationEvent,
): Promise<number> {
  if (!ensureConfigured()) return 0;

  const db = getPool();
  let subscriptions: PushSubscriptionRow[];
  try {
    subscriptions = await listPushSubscriptionsByUserId(db, userId);
  } catch (e) {
    logApiError("[web-push] could not load subscriptions", e, { userId });
    return 0;
  }
  if (subscriptions.length === 0) return 0;

  const payload = JSON.stringify(event);

  const results = await Promise.allSettled(
    subscriptions.map((row) =>
      webpush.sendNotification(toWebPushSubscription(row), payload),
    ),
  );

  let delivered = 0;
  const deadEndpoints: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      delivered += 1;
      return;
    }
    const err = result.reason;
    if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
      deadEndpoints.push(subscriptions[i].endpoint);
    } else {
      logApiError("[web-push] send failed", err, {
        userId,
        endpoint: subscriptions[i].endpoint,
      });
    }
  });

  await Promise.allSettled(
    deadEndpoints.map((endpoint) =>
      deletePushSubscriptionByEndpoint(db, endpoint),
    ),
  );

  return delivered;
}
