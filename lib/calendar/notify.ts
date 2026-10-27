/**
 * Calendar notifications: an in-app row plus a realtime web push for each
 * recipient, and {@link sendEmail} for the messages BA v1.1 also sends by
 * email (BR-03-11 busy conflicts, BR-07-05 reschedules).
 */

import type { QueryExecutor } from "@/lib/db/config/client";
import {
  createNotification,
  toNotificationEvent,
  type NotificationType,
} from "@/lib/db/notifications";
import { pushNotification } from "@/lib/notifications/http-push";
import { fmtMin, isoDateInTz, minuteOfDayInTz, weekdayName, weekStart } from "@/lib/calendar/time";

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

/**
 * Deep link to a session on the calendar: opens the week it falls in and the
 * session itself. Matches the `?week` / `?session` params of /admin/calendar-2.
 */
export function calendarHref(scheduleId: string, start?: Date | string | null): string {
  const q = new URLSearchParams();
  const at = start ? new Date(start) : null;
  if (at && !Number.isNaN(at.getTime())) q.set("week", weekStart(isoDateInTz(at)));
  q.set("session", scheduleId);
  return `/admin/calendar-2?${q.toString()}`;
}

/** "Monday 2026-10-26, 09:30 (GMT+7)" -- a session start for email copy. */
export function fmtWhen(at: Date | string): string {
  const d = new Date(at);
  const date = isoDateInTz(d);
  return `${weekdayName(date)} ${date}, ${fmtMin(minuteOfDayInTz(d))} (GMT+7)`;
}

export type EmailInput = { to: Array<string | null | undefined>; subject: string; text: string };

type EmailEnv = {
  enabled: boolean;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  sender?: string;
};

function emailEnv(): EmailEnv {
  return {
    enabled: process.env.CALENDAR_EMAIL_ENABLED === "true",
    tenantId: process.env.AZURE_AD_TENANT_ID,
    clientId: process.env.AZURE_AD_CLIENT_ID,
    clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
    sender: process.env.MICROSOFT_SENDER_EMAIL,
  };
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function graphToken(env: Required<EmailEnv>, fetchFn: typeof fetch): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const res = await fetchFn(`https://login.microsoftonline.com/${env.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`token request failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

/**
 * Sends a plain-text email from MICROSOFT_SENDER_EMAIL through Microsoft
 * Graph (app permission Mail.Send). Off unless CALENDAR_EMAIL_ENABLED=true;
 * when off or misconfigured it only logs. Never throws: email is best effort
 * and must not fail the request that triggered it.
 */
export async function sendEmail(
  input: EmailInput,
  deps: { fetch?: typeof fetch; env?: EmailEnv } = {},
): Promise<void> {
  const to = [...new Set(input.to.filter((x): x is string => !!x && x.includes("@")))];
  if (to.length === 0) return;
  const env = deps.env ?? emailEnv();
  if (!env.enabled || !env.tenantId || !env.clientId || !env.clientSecret || !env.sender) {
    console.info("[calendar/email] skipped (not configured)", { to, subject: input.subject });
    return;
  }
  const fetchFn = deps.fetch ?? fetch;
  try {
    const token = await graphToken(env as Required<EmailEnv>, fetchFn);
    const res = await fetchFn(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.sender)}/sendMail`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: input.subject,
            body: { contentType: "Text", content: input.text },
            toRecipients: to.map((address) => ({ emailAddress: { address } })),
          },
          saveToSentItems: false,
        }),
      },
    );
    if (!res.ok) throw new Error(`sendMail failed: ${res.status}`);
  } catch (err) {
    console.error("[calendar/email] failed to send", { to, subject: input.subject }, err);
  }
}

/** Test hook: forget the cached Graph token. */
export function resetEmailTokenCache(): void {
  cachedToken = null;
}
