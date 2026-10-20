/**
 * Calendar notifications: an in-app row plus a realtime web push for each
 * recipient. Email delivery is not wired yet -- {@link sendEmail} is a stub.
 */

import type { QueryExecutor } from "@/lib/db/config/client";
import {
  createNotification,
  toNotificationEvent,
  type NotificationType,
} from "@/lib/db/notifications";
import { pushNotification } from "@/lib/notifications/http-push";

export type CalendarNotice = {
  type: NotificationType;
  title: string;
  body?: string | null;
  data?: Record<string, unknown>;
};

/**
 * Notifies each distinct, non-null user. A failure for one recipient is
 * logged and does not stop the others or the caller's request.
 */
export async function notifyUsers(
  db: QueryExecutor,
  userIds: Array<string | null | undefined>,
  notice: CalendarNotice,
): Promise<void> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  for (const userId of ids) {
    try {
      const row = await createNotification(db, { userId, ...notice });
      await pushNotification(userId, toNotificationEvent(row));
    } catch (err) {
      console.error("[calendar/notify] failed to notify", userId, err);
    }
  }
}

/** Placeholder until an email provider is configured. */
export async function sendEmail(_input: {
  to: string[];
  subject: string;
  text: string;
}): Promise<void> {}
