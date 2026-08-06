import { randomUUID } from "crypto";

import { logApiError, logInfo } from "@/lib/logger";
import { isGraphConfigured } from "@/lib/microsoft/authProvider";
import { sendMailViaGraph, type GraphMailAttachment } from "@/lib/microsoft/mail";

export type SendEmailInput = {
  fromEmail: string;
  toEmail: string;
  cc?: string | null;
  bcc?: string | null;
  subject: string;
  bodyHtml: string;
  attachments?: GraphMailAttachment[];
};

export type SendEmailResult =
  | { ok: true; graphMessageId: string | null; simulated: boolean }
  | { ok: false; error: string };

/**
 * Single entry point every send path (manual, bulk, scheduled) goes through.
 * Falls back to a simulated send when Microsoft Graph credentials aren't
 * configured (true today -- no tenant/app registration exists yet) so the
 * rest of the pipeline (queueing, status transitions, logs, thread view) is
 * fully exercisable without live Graph access; flips to a real send the
 * moment `MS_GRAPH_TENANT_ID`/`MS_GRAPH_CLIENT_ID`/`MS_GRAPH_CLIENT_SECRET`
 * are set, with no caller changes needed.
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  if (!isGraphConfigured()) {
    logInfo("Simulated email send (Microsoft Graph not configured)", {
      to: input.toEmail,
      subject: input.subject,
    });
    return {
      ok: true,
      graphMessageId: `simulated-${randomUUID()}`,
      simulated: true,
    };
  }

  try {
    const { graphMessageId } = await sendMailViaGraph(input);
    return { ok: true, graphMessageId, simulated: false };
  } catch (error) {
    logApiError("Failed to send email via Microsoft Graph", error);
    const message =
      error instanceof Error ? error.message : "Failed to send email.";
    return { ok: false, error: message };
  }
}
