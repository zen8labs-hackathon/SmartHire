import { cookies } from "next/headers";
import { z } from "zod";

import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { MAIL_TEST_TOKEN_COOKIE, type MailTestTokenCookie } from "@/lib/auth/azure-mail-delegate";
import { getPool } from "@/lib/db/config/client";
import { getEmailSettings } from "@/lib/db/email-settings";
import { isDevEnv } from "@/lib/env";
import { logApiError } from "@/lib/logger";
import { sendEmail } from "@/lib/email/send-email";
import { sendMailViaGraphDelegated } from "@/lib/microsoft/mail-delegated";

const bodySchema = z.object({
  mode: z.enum(["delegated", "application"]),
  to: z.string().email(),
  subject: z.string().min(1).max(200).optional(),
  bodyHtml: z.string().min(1).max(20_000).optional(),
});

const DEFAULT_SUBJECT = "SmartHire dev-test send";
const DEFAULT_BODY_HTML =
  "<p>This is a test email sent from SmartHire's Dev Test page.</p>";

/**
 * Dev-only tool: sends one real email through either Graph auth mode, both
 * redirected to `to` (never a real candidate address) --
 * see components/admin/dev-test/email-test-panel.tsx.
 *
 * - `mode: "delegated"` uses the signed-in admin's own Mail.Send-scoped
 *   token from the OAuth flow under app/api/admin/email/oauth/microsoft/*
 *   (cookie-only, see lib/auth/azure-mail-delegate.ts) and calls
 *   `POST /me/sendMail` directly.
 * - `mode: "application"` reuses the *exact* production entry point
 *   (lib/email/send-email.ts::sendEmail(), the same function every real
 *   candidate email goes through) with `fromEmail` set to the configured
 *   default sender -- including its simulated-send fallback when
 *   MS_GRAPH_* isn't configured, so this mode doubles as a check of
 *   whether the application-permission app registration actually works.
 */
export async function POST(request: Request) {
  if (!isDevEnv()) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const { mode, to, subject, bodyHtml } = parsed.data;
  const effectiveSubject = subject ?? DEFAULT_SUBJECT;
  const effectiveBodyHtml = bodyHtml ?? DEFAULT_BODY_HTML;

  if (mode === "delegated") {
    const cookieStore = await cookies();
    const raw = cookieStore.get(MAIL_TEST_TOKEN_COOKIE)?.value;
    let tokenCookie: MailTestTokenCookie | null = null;
    if (raw) {
      try {
        tokenCookie = JSON.parse(raw);
      } catch {
        tokenCookie = null;
      }
    }
    if (!tokenCookie || !tokenCookie.expiresAt || tokenCookie.expiresAt <= Date.now()) {
      return Response.json({ error: "not_connected" }, { status: 401 });
    }

    try {
      const result = await sendMailViaGraphDelegated(tokenCookie.accessToken, {
        toEmail: to,
        subject: effectiveSubject,
        bodyHtml: effectiveBodyHtml,
      });
      if (!result.ok) {
        logApiError("Dev-test delegated send failed", new Error(result.error), {
          userId: auth.userId,
        });
        return Response.json({ error: result.error }, { status: 502 });
      }
      return Response.json({ ok: true });
    } catch (error) {
      logApiError("Dev-test delegated send threw", error, { userId: auth.userId });
      return Response.json(
        { error: error instanceof Error ? error.message : "Failed to send test email." },
        { status: 500 },
      );
    }
  }

  // mode === "application"
  const settings = await getEmailSettings(getPool());
  const result = await sendEmail({
    fromEmail: settings.default_sender,
    toEmail: to,
    subject: effectiveSubject,
    bodyHtml: effectiveBodyHtml,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 502 });
  }
  return Response.json({ ok: true, simulated: result.simulated });
}
