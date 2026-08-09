import type { QueryExecutor } from "@/lib/db/config/client";
import { listAttachmentsForMessage } from "@/lib/db/email-attachments";
import type { GraphMailAttachment } from "@/lib/microsoft/mail";
import { downloadObject } from "@/lib/storage/s3";

/**
 * Loads every attachment recorded against a message and downloads each from
 * S3 to build the base64 payload Microsoft Graph's sendMail needs -- this is
 * the step that was previously missing, so attachments were persisted to the
 * DB but never actually reached the outgoing email.
 */
export async function buildGraphAttachmentsForMessage(
  db: QueryExecutor,
  messageId: string,
): Promise<GraphMailAttachment[]> {
  const attachments = await listAttachmentsForMessage(db, messageId);
  if (attachments.length === 0) return [];

  return Promise.all(
    attachments.map(async (attachment) => {
      const bytes = await downloadObject(attachment.storage_path);
      return {
        fileName: attachment.file_name,
        mimeType: attachment.mime_type,
        contentBytesBase64: bytes.toString("base64"),
      };
    }),
  );
}
