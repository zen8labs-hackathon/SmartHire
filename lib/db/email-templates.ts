import type { QueryExecutor } from "@/lib/db/config/client";
import {
  buildSetClause,
  clampLimit,
  clampOffset,
  extractWindowTotal,
  type PaginatedResult,
  type PaginationParams,
} from "@/lib/db/query-helpers";

export type EmailTemplateRow = {
  id: string;
  name: string;
  trigger_type: string;
  language: string;
  subject_template: string;
  body_template: string;
  is_auto_send: boolean;
  require_approval: boolean;
  is_active: boolean;
  default_cc: string | null;
  default_bcc: string | null;
  send_offset_minutes: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type CreateEmailTemplateInput = {
  name: string;
  triggerType: string;
  language?: string;
  subjectTemplate: string;
  bodyTemplate: string;
  isAutoSend?: boolean;
  requireApproval?: boolean;
  isActive?: boolean;
  defaultCc?: string | null;
  defaultBcc?: string | null;
  sendOffsetMinutes?: number;
  createdBy?: string | null;
};

export type UpdateEmailTemplateInput = Partial<
  Omit<CreateEmailTemplateInput, "createdBy">
>;

export type ListEmailTemplatesFilters = PaginationParams & {
  triggerType?: string;
  /** Resolved by the caller from a category via `lib/email/trigger-types.ts` -- `category` itself isn't a DB column. */
  triggerTypes?: string[];
  isActive?: boolean;
};

export async function listEmailTemplates(
  db: QueryExecutor,
  filters: ListEmailTemplatesFilters = {},
): Promise<PaginatedResult<EmailTemplateRow>> {
  const conditions = ["deleted_at IS NULL"];
  const values: unknown[] = [];

  if (filters.triggerType) {
    values.push(filters.triggerType);
    conditions.push(`trigger_type = $${values.length}`);
  }
  if (filters.triggerTypes && filters.triggerTypes.length > 0) {
    values.push(filters.triggerTypes);
    conditions.push(`trigger_type = ANY($${values.length})`);
  }
  if (filters.isActive !== undefined) {
    values.push(filters.isActive);
    conditions.push(`is_active = $${values.length}`);
  }

  const limit = clampLimit(filters.limit);
  const offset = clampOffset(filters.offset);
  values.push(limit, offset);

  const { rows } = await db.query<EmailTemplateRow & { total_count: string }>(
    `SELECT *, count(*) OVER() AS total_count
     FROM email_templates
     WHERE ${conditions.join(" AND ")}
     ORDER BY trigger_type ASC, name ASC
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

export async function getEmailTemplateById(
  db: QueryExecutor,
  id: string,
): Promise<EmailTemplateRow | null> {
  const { rows } = await db.query<EmailTemplateRow>(
    `SELECT * FROM email_templates WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listActiveEmailTemplatesByTriggerType(
  db: QueryExecutor,
  triggerType: string,
): Promise<EmailTemplateRow[]> {
  const { rows } = await db.query<EmailTemplateRow>(
    `SELECT * FROM email_templates
     WHERE trigger_type = $1 AND is_active = true AND deleted_at IS NULL
     ORDER BY name ASC`,
    [triggerType],
  );
  return rows;
}

export async function createEmailTemplate(
  db: QueryExecutor,
  input: CreateEmailTemplateInput,
): Promise<EmailTemplateRow> {
  const { rows } = await db.query<EmailTemplateRow>(
    `INSERT INTO email_templates
       (name, trigger_type, language, subject_template, body_template,
        is_auto_send, require_approval, is_active, default_cc, default_bcc,
        send_offset_minutes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      input.name,
      input.triggerType,
      input.language ?? "vi",
      input.subjectTemplate,
      input.bodyTemplate,
      input.isAutoSend ?? false,
      input.requireApproval ?? false,
      input.isActive ?? true,
      input.defaultCc ?? null,
      input.defaultBcc ?? null,
      input.sendOffsetMinutes ?? 0,
      input.createdBy ?? null,
    ],
  );
  return rows[0];
}

export async function updateEmailTemplate(
  db: QueryExecutor,
  id: string,
  patch: UpdateEmailTemplateInput,
): Promise<EmailTemplateRow | null> {
  const { clause, values } = buildSetClause(
    {
      name: patch.name,
      trigger_type: patch.triggerType,
      language: patch.language,
      subject_template: patch.subjectTemplate,
      body_template: patch.bodyTemplate,
      is_auto_send: patch.isAutoSend,
      require_approval: patch.requireApproval,
      is_active: patch.isActive,
      default_cc: patch.defaultCc,
      default_bcc: patch.defaultBcc,
      send_offset_minutes: patch.sendOffsetMinutes,
    },
    2,
  );
  if (!clause) return getEmailTemplateById(db, id);

  const { rows } = await db.query<EmailTemplateRow>(
    `UPDATE email_templates
     SET ${clause}, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id, ...values],
  );
  return rows[0] ?? null;
}

export async function softDeleteEmailTemplate(
  db: QueryExecutor,
  id: string,
): Promise<EmailTemplateRow | null> {
  const { rows } = await db.query<EmailTemplateRow>(
    `UPDATE email_templates
     SET deleted_at = now(), updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
}
