"use client";

import { Button, Modal } from "@heroui/react";

import { EmailPreviewCard } from "@/components/admin/email-config/email-preview-card";
import { applyEmailLayout } from "@/lib/email/email-layout";
import { renderEmailTemplate } from "@/lib/email/render-template";
import { getRecipientTypeForTrigger } from "@/lib/email/trigger-types";

const FALLBACK_SENDER_EMAIL = "recruiting@smart-hire.test";
const FALLBACK_COMPANY_NAME = "SmartHire";

function capitalizeFirstLetter(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Renders the "email client" style preview from raw subject/body templates
 * rather than a saved `EmailTemplateListItem` -- so it can be reused both
 * for a persisted template (the list card's Preview button) and for a form
 * still being edited/created, which has no id yet. Lives in its own file
 * (rather than inside email-templates-tab.tsx or email-template-form-modal.tsx)
 * so both of those can import it without a circular dependency.
 */
export function EmailTemplatePreviewModal({
  isOpen,
  onOpenChange,
  name,
  subjectTemplate,
  bodyTemplate,
  triggerType,
  defaultCc,
  defaultBcc,
  fromEmail,
  companyName,
  layoutType,
  customLayoutHtml,
  logoUrl,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
  /** Determines the sample "To:" audience label via `getRecipientTypeForTrigger` -- see lib/email/trigger-types.ts. */
  triggerType: string;
  defaultCc?: string | null;
  defaultBcc?: string | null;
  fromEmail?: string;
  companyName?: string | null;
  layoutType?: "default" | "custom";
  customLayoutHtml?: string | null;
  logoUrl?: string | null;
}) {
  const effectiveCompanyName = companyName || FALLBACK_COMPANY_NAME;
  const recipientType = getRecipientTypeForTrigger(triggerType);
  // No sample candidate/schedule data -- `{{candidate_name}}`,
  // `{{interview_date}}`, etc. are left as literal placeholders (and shown
  // highlighted, see EmailPreviewCard) rather than filled with fake values
  // that could be mistaken for real content. `company_name` is real
  // configured data, not a sample, so it's still substituted.
  const vars = { company_name: effectiveCompanyName };
  const previewSubject = renderEmailTemplate(subjectTemplate, vars);
  const renderedBody = renderEmailTemplate(bodyTemplate, vars);
  const previewBody = applyEmailLayout({
    bodyHtml: renderedBody,
    companyName: effectiveCompanyName,
    logoUrl,
    layoutType: layoutType ?? "default",
    customLayoutHtml,
  });

  return (
    <Modal.Backdrop
      className="bg-black/40 backdrop-blur-sm"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    >
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-[650px] overflow-hidden p-0 rounded-2xl border border-divider bg-surface-primary shadow-2xl animate-in fade-in zoom-in-95 duration-200 font-sans">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-divider px-6 py-4 bg-surface-secondary/20">
            <Modal.Heading className="text-xs font-bold uppercase tracking-wider text-muted">
              Email Preview — {name || "Untitled template"}
            </Modal.Heading>
          </Modal.Header>

          <Modal.Body className="max-h-[70vh] overflow-y-auto px-6 py-6">
            <EmailPreviewCard
              subject={previewSubject}
              bodyHtml={previewBody}
              to={`${capitalizeFirstLetter(recipientType)} <candidate@example.com>`}
              cc={defaultCc}
              bcc={defaultBcc}
              fromName={`${effectiveCompanyName} Recruiting`}
              fromEmail={fromEmail || FALLBACK_SENDER_EMAIL}
              dateLabel="Mon, Aug 3, 2026, 2:30 PM"
            />
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
