import type { QueryExecutor } from "@/lib/db/config/client";
import { buildSetClause } from "@/lib/db/query-helpers";

export type EmailSettingsRow = {
  id: string;
  default_sender: string;
  company_name: string;
  signature_html: string | null;
  logo_url: string | null;
  created_at: Date;
  updated_at: Date;
};

export type UpdateEmailSettingsInput = {
  defaultSender?: string;
  companyName?: string;
  signatureHtml?: string | null;
  logoUrl?: string | null;
};

const DEFAULT_SENDER = "no-reply@smart-hire.test";

/**
 * `email_settings` is a singleton -- there's no seed migration for it, so the
 * first read bootstraps the one row that every later read/write reuses.
 */
export async function getEmailSettings(
  db: QueryExecutor,
): Promise<EmailSettingsRow> {
  const { rows } = await db.query<EmailSettingsRow>(
    `SELECT * FROM email_settings ORDER BY created_at ASC LIMIT 1`,
  );
  if (rows[0]) return rows[0];

  const { rows: inserted } = await db.query<EmailSettingsRow>(
    `INSERT INTO email_settings (default_sender) VALUES ($1) RETURNING *`,
    [DEFAULT_SENDER],
  );
  return inserted[0];
}

export async function updateEmailSettings(
  db: QueryExecutor,
  patch: UpdateEmailSettingsInput,
): Promise<EmailSettingsRow> {
  const current = await getEmailSettings(db);

  const { clause, values } = buildSetClause(
    {
      default_sender: patch.defaultSender,
      company_name: patch.companyName,
      signature_html: patch.signatureHtml,
      logo_url: patch.logoUrl,
    },
    2,
  );
  if (!clause) return current;

  const { rows } = await db.query<EmailSettingsRow>(
    `UPDATE email_settings
     SET ${clause}, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [current.id, ...values],
  );
  return rows[0];
}
