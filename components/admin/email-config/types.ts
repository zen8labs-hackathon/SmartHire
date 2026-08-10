import type { EmailRecipientType } from "@/lib/email/trigger-types";

/**
 * Wire shapes for the Email Config client components -- mirror the DB rows
 * field-for-field (snake_case, matching the API's pass-through JSON) but
 * with `Date` columns narrowed to the ISO strings `Response.json()` actually
 * produces, since `fetch().then(r => r.json())` never gives back real `Date`
 * objects the way a server-to-client RSC prop would.
 */
export type EmailTemplateListItem = {
  id: string;
  name: string;
  trigger_type: string;
  recipient_type: EmailRecipientType;
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
  created_at: string;
  updated_at: string;
  attachments?: EmailAttachmentItem[];
};

export type EmailSettingsData = {
  id: string;
  default_sender: string;
  company_name: string;
  signature_html: string | null;
  logo_url: string | null;
};

export type EmailMessageListItem = {
  id: string;
  campaign_applied_id: string | null;
  job_id: string | null;
  job_position: string | null;
  template_id: string | null;
  sender_user_id: string | null;
  type: "manual" | "auto" | "scheduled";
  status:
    | "draft"
    | "pending_approval"
    | "sending"
    | "sent"
    | "failed"
    | "cancelled";
  trigger_type: string | null;
  from_email: string;
  to_email: string;
  cc: string | null;
  bcc: string | null;
  subject: string;
  body_html: string;
  sent_at: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
};

export type EmailAttachmentItem = {
  id: string;
  file_name: string;
  mime_type: string;
  storage_path: string;
  file_size: string;
};

/** The message being replied to, used by `BulkEmailModal` to prefill
 * subject/quoted body -- see `CandidateEmailTab`'s per-message "Reply"
 * action. Sending still always creates a brand-new `email_messages` row (no
 * inbound/threading backend exists yet), this only shapes the compose form's
 * starting content. */
export type ReplyToContext = {
  subject: string;
  bodyHtml: string;
  fromEmail: string;
  sentAt: string | null;
};
