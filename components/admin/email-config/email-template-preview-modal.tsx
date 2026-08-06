"use client";

import { Button, Modal } from "@heroui/react";

import { EmailPreviewCard } from "@/components/admin/email-config/email-preview-card";
import { wrapEmailBodyInCard } from "@/lib/email/email-layout";
import { renderEmailTemplate } from "@/lib/email/render-template";

const FALLBACK_SENDER_EMAIL = "recruiting@smart-hire.test";
const FALLBACK_COMPANY_NAME = "SmartHire";

export const SAMPLE_VARS: Record<string, string> = {
  candidate_name: "Nguyễn Văn A",
  candidate_email: "nguyenvana@example.com",
  position: "Backend Engineer",
  department: "Engineering",
  hr_name: "hr@smart-hire.test",
  interview_date: "10/08/2026",
  interview_time: "14:30",
  interview_location: "Phòng họp A, Tầng 5",
};

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
  recipientType,
  defaultCc,
  defaultBcc,
  fromEmail,
  companyName,
  signatureHtml,
  logoUrl,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
  recipientType: string;
  defaultCc?: string | null;
  defaultBcc?: string | null;
  fromEmail?: string;
  companyName?: string | null;
  signatureHtml?: string | null;
  logoUrl?: string | null;
}) {
  const effectiveCompanyName = companyName || FALLBACK_COMPANY_NAME;
  const sampleVars = { ...SAMPLE_VARS, company_name: effectiveCompanyName };
  const previewSubject = renderEmailTemplate(subjectTemplate, sampleVars);
  const renderedBody = renderEmailTemplate(bodyTemplate, sampleVars);
  const bodyWithSignature = signatureHtml
    ? `${renderedBody}<br /><br />${signatureHtml}`
    : renderedBody;
  const previewBody = wrapEmailBodyInCard({
    bodyHtml: bodyWithSignature,
    companyName: effectiveCompanyName,
    logoUrl,
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
