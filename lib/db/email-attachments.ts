import type { QueryExecutor } from "@/lib/db/config/client";

/**
 * One shared table for both message attachments (an actual sent/pending
 * email) and template default attachments -- exactly one of `message_id` /
 * `template_id` is set per row (enforced by `email_attachments_owner_check`).
 */
export type EmailAttachmentRow = {
  id: string;
  message_id: string | null;
  template_id: string | null;
  file_name: string;
  mime_type: string;
  storage_path: string;
  file_size: string;
  created_at: Date;
};

export type AttachmentFileInput = {
  fileName: string;
  mimeType: string;
  storagePath: string;
  fileSize: number;
};

export type CreateEmailAttachmentInput = AttachmentFileInput & {
  messageId: string;
};

export async function createEmailAttachment(
  db: QueryExecutor,
  input: CreateEmailAttachmentInput,
): Promise<EmailAttachmentRow> {
  const { rows } = await db.query<EmailAttachmentRow>(
    `INSERT INTO email_attachments (message_id, file_name, mime_type, storage_path, file_size)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.messageId,
      input.fileName,
      input.mimeType,
      input.storagePath,
      input.fileSize,
    ],
  );
  return rows[0];
}

export async function listAttachmentsForMessage(
  db: QueryExecutor,
  messageId: string,
): Promise<EmailAttachmentRow[]> {
  const { rows } = await db.query<EmailAttachmentRow>(
    `SELECT * FROM email_attachments WHERE message_id = $1 ORDER BY created_at ASC`,
    [messageId],
  );
  return rows;
}

export async function listAttachmentsForTemplate(
  db: QueryExecutor,
  templateId: string,
): Promise<EmailAttachmentRow[]> {
  const { rows } = await db.query<EmailAttachmentRow>(
    `SELECT * FROM email_attachments WHERE template_id = $1 ORDER BY created_at ASC`,
    [templateId],
  );
  return rows;
}

/** Batch variant for the templates list endpoint -- avoids one query per row. */
export async function listAttachmentsForTemplateIds(
  db: QueryExecutor,
  templateIds: string[],
): Promise<Map<string, EmailAttachmentRow[]>> {
  const grouped = new Map<string, EmailAttachmentRow[]>();
  if (templateIds.length === 0) return grouped;

  const { rows } = await db.query<EmailAttachmentRow>(
    `SELECT * FROM email_attachments
     WHERE template_id = ANY($1)
     ORDER BY template_id, created_at ASC`,
    [templateIds],
  );
  for (const row of rows) {
    const list = grouped.get(row.template_id!);
    if (list) {
      list.push(row);
    } else {
      grouped.set(row.template_id!, [row]);
    }
  }
  return grouped;
}

/** Full replace: deletes the template's existing default-attachment set and inserts the new one. */
export async function replaceTemplateAttachments(
  db: QueryExecutor,
  templateId: string,
  attachments: AttachmentFileInput[],
): Promise<EmailAttachmentRow[]> {
  await db.query(`DELETE FROM email_attachments WHERE template_id = $1`, [templateId]);
  if (attachments.length === 0) return [];

  const values: unknown[] = [];
  const rowsSql = attachments.map((a, i) => {
    const base = i * 5;
    values.push(templateId, a.fileName, a.mimeType, a.storagePath, a.fileSize);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });

  const { rows } = await db.query<EmailAttachmentRow>(
    `INSERT INTO email_attachments (template_id, file_name, mime_type, storage_path, file_size)
     VALUES ${rowsSql.join(", ")}
     RETURNING *`,
    values,
  );
  return rows;
}

/** Batch insert -- one round trip for N attachments instead of N `createEmailAttachment` calls. */
export async function createEmailAttachments(
  db: QueryExecutor,
  messageId: string,
  attachments: AttachmentFileInput[],
): Promise<EmailAttachmentRow[]> {
  if (attachments.length === 0) return [];

  const values: unknown[] = [];
  const rowsSql = attachments.map((a, i) => {
    const base = i * 5;
    values.push(messageId, a.fileName, a.mimeType, a.storagePath, a.fileSize);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });

  const { rows } = await db.query<EmailAttachmentRow>(
    `INSERT INTO email_attachments (message_id, file_name, mime_type, storage_path, file_size)
     VALUES ${rowsSql.join(", ")}
     RETURNING *`,
    values,
  );
  return rows;
}

/** Copies a template's default attachments onto a message (used when a send is composed from that template). */
export async function copyTemplateAttachmentsToMessage(
  db: QueryExecutor,
  messageId: string,
  templateId: string,
): Promise<void> {
  const templateAttachments = await listAttachmentsForTemplate(db, templateId);
  await createEmailAttachments(
    db,
    messageId,
    templateAttachments.map((a) => ({
      fileName: a.file_name,
      mimeType: a.mime_type,
      storagePath: a.storage_path,
      fileSize: Number(a.file_size),
    })),
  );
}
