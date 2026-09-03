import type { QueryExecutor } from "@/lib/db/config/client";
import { clampLimit } from "@/lib/db/query-helpers";
import {
  NOTIFICATION_TYPE,
  type NotificationEvent,
  type NotificationType,
} from "@/lib/redis/channels";

// Re-exported for existing callers -- moved to `lib/redis/channels.ts` so
// client components can use it without pulling in the `pg`-backed DB layer.
export { NOTIFICATION_TYPE };
export type { NotificationType };

/** One row of `notifications`. `read_at IS NULL` <=> unread (no `status` column). */
export type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  read_at: Date | null;
  created_at: Date;
};

const COLUMNS = `id, user_id, type, title, body, data, read_at, created_at`;

/** DB row -> realtime SSE payload shape (see `lib/redis/channels.ts`). */
export function toNotificationEvent(row: NotificationRow): NotificationEvent {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data,
    createdAt: row.created_at.toISOString(),
    readAt: row.read_at?.toISOString() ?? null,
  };
}

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  data?: Record<string, unknown>;
};

/** Insert 1 notification row. Nguồn lưu trữ -- gọi TRƯỚC khi bắn realtime. */
export async function createNotification(
  db: QueryExecutor,
  input: CreateNotificationInput,
): Promise<NotificationRow> {
  const { rows } = await db.query<NotificationRow>(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLUMNS}`,
    [
      input.userId,
      input.type,
      input.title,
      input.body ?? null,
      JSON.stringify(input.data ?? {}),
    ],
  );
  return rows[0];
}

export type ListNotificationsOptions = {
  limit?: number;
  /** Keyset cursor: only rows older than this id (uuid v7 = time-ordered). */
  before?: string;
  unreadOnly?: boolean;
};

/** A user's notifications, newest first. Backs the bell dropdown + its "load more". */
export async function listNotifications(
  db: QueryExecutor,
  userId: string,
  opts: ListNotificationsOptions = {},
): Promise<NotificationRow[]> {
  const conditions = ["user_id = $1"];
  const values: unknown[] = [userId];

  if (opts.before) {
    values.push(opts.before);
    conditions.push(`id < $${values.length}`);
  }
  if (opts.unreadOnly) {
    conditions.push("read_at IS NULL");
  }

  values.push(clampLimit(opts.limit));

  const { rows } = await db.query<NotificationRow>(
    `SELECT ${COLUMNS} FROM notifications
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC, id DESC
     LIMIT $${values.length}`,
    values,
  );
  return rows;
}

/** Unread count for the badge -- served by the partial index `notifications_user_unread_idx`. */
export async function countUnreadNotifications(
  db: QueryExecutor,
  userId: string,
): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    `SELECT count(*) AS count FROM notifications
     WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return Number(rows[0]?.count ?? 0);
}

/**
 * Marks one notification read. Scoped by `user_id` so a caller can't touch
 * someone else's row. Idempotent: `read_at` is only stamped once (re-marking a
 * read row is a no-op). Returns the row, or `null` if the id doesn't belong to
 * this user (or doesn't exist).
 */
export async function markNotificationRead(
  db: QueryExecutor,
  userId: string,
  id: string,
): Promise<NotificationRow | null> {
  const { rows } = await db.query<NotificationRow>(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, now())
     WHERE id = $1 AND user_id = $2
     RETURNING ${COLUMNS}`,
    [id, userId],
  );
  return rows[0] ?? null;
}

/** Marks every unread notification for a user read. Returns how many flipped. */
export async function markAllNotificationsRead(
  db: QueryExecutor,
  userId: string,
): Promise<number> {
  const { rows } = await db.query<{ id: string }>(
    `UPDATE notifications
     SET read_at = now()
     WHERE user_id = $1 AND read_at IS NULL
     RETURNING id`,
    [userId],
  );
  return rows.length;
}
