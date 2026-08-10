import { getGraphClient } from "@/lib/microsoft/graph-client";

export type GraphMailAttachment = {
  fileName: string;
  mimeType: string;
  contentBytesBase64: string;
};

export type SendMailViaGraphInput = {
  fromEmail: string;
  toEmail: string;
  cc?: string | null;
  bcc?: string | null;
  subject: string;
  bodyHtml: string;
  attachments?: GraphMailAttachment[];
};

function toRecipients(addresses: string | null | undefined) {
  if (!addresses) return undefined;
  return addresses
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));
}

/**
 * Sends via `POST /users/{fromEmail}/sendMail` (application-permission Graph
 * flow -- the caller impersonates a mailbox rather than acting as a signed-in
 * user). Requires `Mail.Send` application permission granted to the app
 * registration behind `MS_GRAPH_CLIENT_ID`.
 */
export async function sendMailViaGraph(
  input: SendMailViaGraphInput,
): Promise<{ graphMessageId: string | null }> {
  const client = getGraphClient();

  const response = await client
    .api(`/users/${encodeURIComponent(input.fromEmail)}/sendMail`)
    .post({
      message: {
        subject: input.subject,
        body: { contentType: "HTML", content: input.bodyHtml },
        toRecipients: toRecipients(input.toEmail),
        ccRecipients: toRecipients(input.cc),
        bccRecipients: toRecipients(input.bcc),
        attachments: input.attachments?.map((attachment) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: attachment.fileName,
          contentType: attachment.mimeType,
          contentBytes: attachment.contentBytesBase64,
        })),
      },
      saveToSentItems: true,
    });

  // Graph's sendMail returns 202 Accepted with no body, so there's no
  // message id to read back from this call -- conversation/message ids only
  // become available via a later Sent Items lookup, which is out of scope
  // here (see lib/email/send-email.ts).
  return { graphMessageId: response?.id ?? null };
}
