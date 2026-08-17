import { toRecipients } from "@/lib/microsoft/mail";

export type SendMailViaGraphDelegatedInput = {
  toEmail: string;
  subject: string;
  bodyHtml: string;
};

/**
 * Sends via `POST /me/sendMail` using a *delegated* access token (the
 * caller's own token from the Mail.Send-scoped test OAuth flow in
 * lib/auth/azure-mail-delegate.ts) -- as opposed to sendMailViaGraph in
 * lib/microsoft/mail.ts, which impersonates an arbitrary mailbox via
 * application permission. This exists only to let an admin verify Graph
 * mail sending works end-to-end without waiting on tenant-admin consent for
 * the application-permission app registration.
 */
export async function sendMailViaGraphDelegated(
  accessToken: string,
  input: SendMailViaGraphDelegatedInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: { contentType: "HTML", content: input.bodyHtml },
        toRecipients: toRecipients(input.toEmail),
      },
      saveToSentItems: true,
    }),
  });

  if (response.status === 202) return { ok: true };

  const text = await response.text().catch(() => "");
  return { ok: false, error: `graph_${response.status}: ${text.slice(0, 300)}` };
}
