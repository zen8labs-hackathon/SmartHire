import type { QueryExecutor } from "@/lib/db/config/client";
import {
  clampLimit,
  clampOffset,
  extractWindowTotal,
  type PaginatedResult,
  type PaginationParams,
} from "@/lib/db/query-helpers";

export type EmailMessageType = "manual" | "auto" | "scheduled";
export type EmailMessageStatus =
  | "draft"
  | "pending_approval"
  | "sending"
  | "sent"
  | "failed"
  | "cancelled";

export type EmailMessageRow = {
  id: string;
  campaign_applied_id: string | null;
  job_id: string | null;
  template_id: string | null;
  sender_user_id: string | null;
  type: EmailMessageType;
  status: EmailMessageStatus;
  trigger_type: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  conversation_id: string | null;
  from_email: string;
  to_email: string;
  cc: string | null;
  bcc: string | null;
  subject: string;
  body_html: string;
  body_text: string | null;
  graph_message_id: string | null;
  sent_at: Date | null;
  error_message: string | null;
  retry_count: number;
  created_at: Date;
};

export type CreateEmailMessageInput = {
  campaignAppliedId?: string | null;
  jobId?: string | null;
  templateId?: string | null;
  senderUserId?: string | null;
  type: EmailMessageType;
  status?: EmailMessageStatus;
  triggerType?: string | null;
  fromEmail: string;
  toEmail: string;
  cc?: string | null;
  bcc?: string | null;
  subject: string;
  bodyHtml: string;
  bodyText?: string | null;
};

export type UpdateEmailMessageStatusInput = {
  status: EmailMessageStatus;
  sentAt?: Date | null;
  errorMessage?: string | null;
  graphMessageId?: string | null;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  /** Set to increment the existing retry_count by one; omit to leave it unchanged. */
  incrementRetryCount?: boolean;
};

export type ListEmailMessagesFilters = PaginationParams & {
  campaignAppliedId?: string;
  /** Every email sent across every job application this candidate has on
   * file, not just one -- used by the candidate-detail page's "all mail"
   * view, as opposed to `campaignAppliedId` which scopes to one job. */
  candidateId?: string;
  jobId?: string;
  status?: EmailMessageStatus;
  triggerType?: string;
  /** Case-insensitive partial match against `to_email` -- the Email Logs tab's search box. */
  toEmail?: string;
};

export async function createEmailMessage(
  db: QueryExecutor,
  input: CreateEmailMessageInput,
): Promise<EmailMessageRow> {
  const { rows } = await db.query<EmailMessageRow>(
    `INSERT INTO email_messages
       (campaign_applied_id, job_id, template_id, sender_user_id, type, status,
        trigger_type, from_email, to_email, cc, bcc, subject, body_html, body_text)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      input.campaignAppliedId ?? null,
      input.jobId ?? null,
      input.templateId ?? null,
      input.senderUserId ?? null,
      input.type,
      input.status ?? "draft",
      input.triggerType ?? null,
      input.fromEmail,
      input.toEmail,
      input.cc ?? null,
      input.bcc ?? null,
      input.subject,
      input.bodyHtml,
      input.bodyText ?? null,
    ],
  );
  return rows[0];
}

export async function updateEmailMessageStatus(
  db: QueryExecutor,
  id: string,
  patch: UpdateEmailMessageStatusInput,
): Promise<EmailMessageRow | null> {
  const { rows } = await db.query<EmailMessageRow>(
    `UPDATE email_messages
     SET status = $2,
         sent_at = COALESCE($3, sent_at),
         error_message = $4,
         graph_message_id = COALESCE($5, graph_message_id),
         approved_by = COALESCE($6, approved_by),
         approved_at = COALESCE($7, approved_at),
         retry_count = retry_count + CASE WHEN $8 THEN 1 ELSE 0 END
     WHERE id = $1
     RETURNING *`,
    [
      id,
      patch.status,
      patch.sentAt ?? null,
      patch.errorMessage ?? null,
      patch.graphMessageId ?? null,
      patch.approvedBy ?? null,
      patch.approvedAt ?? null,
      patch.incrementRetryCount ?? false,
    ],
  );
  return rows[0] ?? null;
}

export async function getEmailMessageById(
  db: QueryExecutor,
  id: string,
): Promise<EmailMessageRow | null> {
  const { rows } = await db.query<EmailMessageRow>(
    `SELECT * FROM email_messages WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listEmailMessagesByCampaignApplied(
  db: QueryExecutor,
  campaignAppliedId: string,
): Promise<EmailMessageRow[]> {
  const { rows } = await db.query<EmailMessageRow>(
    `SELECT * FROM email_messages
     WHERE campaign_applied_id = $1
     ORDER BY created_at DESC`,
    [campaignAppliedId],
  );
  return rows;
}

export async function listEmailMessages(
  db: QueryExecutor,
  filters: ListEmailMessagesFilters = {},
): Promise<PaginatedResult<EmailMessageRow>> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.campaignAppliedId) {
    values.push(filters.campaignAppliedId);
    conditions.push(`campaign_applied_id = $${values.length}`);
  }
  if (filters.candidateId) {
    values.push(filters.candidateId);
    conditions.push(
      `campaign_applied_id IN (SELECT id FROM campaign_applied WHERE candidate_id = $${values.length} AND deleted_at IS NULL)`,
    );
  }
  if (filters.jobId) {
    values.push(filters.jobId);
    conditions.push(`job_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }
  if (filters.triggerType) {
    values.push(filters.triggerType);
    conditions.push(`trigger_type = $${values.length}`);
  }
  if (filters.toEmail) {
    values.push(`%${filters.toEmail}%`);
    conditions.push(`to_email ILIKE $${values.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const limit = clampLimit(filters.limit);
  const offset = clampOffset(filters.offset);
  values.push(limit, offset);

  const { rows } = await db.query<EmailMessageRow & { total_count: string }>(
    `SELECT *, count(*) OVER() AS total_count
     FROM email_messages
     ${where}
     ORDER BY created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  return {
    rows,
    total: extractWindowTotal(rows),
    limit,
    offset,
  };
}
