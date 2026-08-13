import type { PublicUserRow } from "@/lib/db/users";
import { applyEmailLayout } from "@/lib/email/email-layout";
import { renderEmailSubjectAndBody, type EmailTemplateVariables } from "@/lib/email/render-template";

const FALLBACK_COMPANY_NAME = "SmartHire";

export type ComposedSelfNotificationEmail = {
  toEmail: string;
  subject: string;
  bodyHtml: string;
};

export type ComposeSelfNotificationOptions = {
  companyName?: string | null;
  /** Rendered in the card header in place of the company name text, when set. */
  logoUrl?: string | null;
  /** The org-wide layout from `email_settings` -- defaults to the card layout when omitted. */
  layoutType?: "default" | "custom";
  customLayoutHtml?: string | null;
  /** The staff account that triggered this notification (e.g. the admin who created the account). Null for self-provisioned signups. */
  actingUser?: { name?: string | null; email?: string | null; phone?: string | null } | null;
};

/**
 * Composes a notification email addressed to a `users` account itself (e.g.
 * "your account was created") -- the `recipient_type: 'self'` counterpart to
 * `composeEmailForCandidate`, which is always addressed to a candidate. No DB
 * access needed: unlike the candidate flow there's no job/schedule to join
 * against, just the recipient row already in hand.
 */
export function composeSelfNotificationEmail(
  recipient: PublicUserRow,
  subjectTemplate: string,
  bodyTemplate: string,
  options: ComposeSelfNotificationOptions = {},
): ComposedSelfNotificationEmail | null {
  if (!recipient.email) return null;
  const { companyName, logoUrl, layoutType, customLayoutHtml, actingUser } = options;

  const vars: EmailTemplateVariables = {
    receiver_name: recipient.display_name || recipient.username,
    receiver_email: recipient.email,
    company_name: companyName ?? "",
    user_name: actingUser?.name ?? "",
    user_email: actingUser?.email ?? "",
    user_phone: actingUser?.phone ?? "",
  };

  const { subject, bodyHtml } = renderEmailSubjectAndBody(
    subjectTemplate,
    bodyTemplate,
    vars,
  );
  return {
    toEmail: recipient.email,
    subject,
    bodyHtml: applyEmailLayout({
      bodyHtml,
      companyName: companyName || FALLBACK_COMPANY_NAME,
      logoUrl,
      layoutType: layoutType ?? "default",
      customLayoutHtml,
    }),
  };
}
