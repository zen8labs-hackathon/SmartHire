/** Channel riêng cho từng user */
export function notificationsChannel(userId: string): string {
  return `notifications:${userId}`;
}

/** `notifications.type` values -- keep every read/write keyed off this object
 * instead of a repeated string literal. Drives the render variant on the FE.
 * Lives here (not `lib/db/notifications.ts`) so client components can import
 * it without pulling in the `pg`-backed DB layer. */
export const NOTIFICATION_TYPE = {
  BatchComplete: "BATCH_COMPLETE",
  RerunAiMatchComplete: "RERUN_AI_MATCH_COMPLETE",
  RerunAiMatchFailed: "RERUN_AI_MATCH_FAILED",
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

export type NotificationEvent = {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  data?: Record<string, unknown>;
  createdAt: string; // ISO timestamp
  readAt: string | null; // ISO timestamp, null nếu chưa đọc
};
