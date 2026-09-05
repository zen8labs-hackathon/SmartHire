import type { QueryExecutor } from "@/lib/db/config/client";

/**
 * One row of `push_subscriptions` -- a single browser/device that opted in to
 * Web Push (RFC 8291 / VAPID). `endpoint` is the push service URL and is
 * globally unique per subscription; `p256dh` + `auth` are the client keys the
 * sender uses to encrypt the payload. See
 * `migrations/1788233600994_notifications-and-push-subscriptions.sql`.
 */
export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: Date;
};

const COLUMNS = `id, user_id, endpoint, p256dh, auth, user_agent, created_at`;

export type UpsertPushSubscriptionInput = {
  userId: string;
  endpoint: string;
  /** `PushSubscription.keys` from the browser. */
  p256dh: string;
  auth: string;
  userAgent?: string | null;
};

/**
 * Records (or refreshes) a browser's push subscription. Keyed on `endpoint`
 * (its UNIQUE constraint): re-subscribing from the same browser -- or the same
 * browser after a different user logs in -- updates the existing row rather
 * than inserting a duplicate or failing. The push service can also rotate an
 * endpoint's keys (`pushsubscriptionchange`), so `p256dh`/`auth` are refreshed
 * too.
 */
export async function upsertPushSubscription(
  db: QueryExecutor,
  input: UpsertPushSubscriptionInput,
): Promise<PushSubscriptionRow> {
  const { rows } = await db.query<PushSubscriptionRow>(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id    = EXCLUDED.user_id,
       p256dh     = EXCLUDED.p256dh,
       auth       = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent
     RETURNING ${COLUMNS}`,
    [
      input.userId,
      input.endpoint,
      input.p256dh,
      input.auth,
      input.userAgent ?? null,
    ],
  );
  return rows[0];
}

/** Every device a user opted in on -- the fan-out set when sending them a push. */
export async function listPushSubscriptionsByUserId(
  db: QueryExecutor,
  userId: string,
): Promise<PushSubscriptionRow[]> {
  const { rows } = await db.query<PushSubscriptionRow>(
    `SELECT ${COLUMNS} FROM push_subscriptions
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC`,
    [userId],
  );
  return rows;
}

/**
 * Subscriptions for many users in one round-trip -- avoids an N+1 when a
 * single event fans out to a group of recipients. Rows come back interleaved;
 * the caller groups by `user_id`.
 */
export async function listPushSubscriptionsByUserIds(
  db: QueryExecutor,
  userIds: string[],
): Promise<PushSubscriptionRow[]> {
  if (userIds.length === 0) return [];

  const { rows } = await db.query<PushSubscriptionRow>(
    `SELECT ${COLUMNS} FROM push_subscriptions
     WHERE user_id = ANY($1::uuid[])
     ORDER BY user_id, created_at DESC, id DESC`,
    [userIds],
  );
  return rows;
}

/**
 * Deletes a subscription by its endpoint, regardless of owner. Used by the
 * sender to prune a dead subscription after the push service answers `404`
 * (unknown) or `410` (gone).
 */
export async function deletePushSubscriptionByEndpoint(
  db: QueryExecutor,
  endpoint: string,
): Promise<boolean> {
  const { rows } = await db.query<{ id: string }>(
    `DELETE FROM push_subscriptions WHERE endpoint = $1 RETURNING id`,
    [endpoint],
  );
  return rows.length > 0;
}

/**
 * Deletes a subscription only if it belongs to `userId` -- backs the client's
 * explicit "turn off notifications" / unsubscribe call, so one user can't drop
 * another's row by guessing an endpoint. Returns `false` when nothing matched.
 */
export async function deletePushSubscriptionForUser(
  db: QueryExecutor,
  userId: string,
  endpoint: string,
): Promise<boolean> {
  const { rows } = await db.query<{ id: string }>(
    `DELETE FROM push_subscriptions
     WHERE endpoint = $1 AND user_id = $2
     RETURNING id`,
    [endpoint, userId],
  );
  return rows.length > 0;
}
