"use client";

import { useEffect, useState } from "react";
import { Alert, Modal } from "@heroui/react";

import { EmailPreviewCard } from "@/components/admin/email-config/email-preview-card";
import { EMAIL_STATUS_STYLES } from "@/components/admin/email-config/email-status-styles";
import type {
  EmailAttachmentItem,
  EmailMessageListItem,
} from "@/components/admin/email-config/types";
import { formatDisplayDateTime } from "@/lib/format-date";

/**
 * Row-click detail view for a single `email_messages` row -- shared by the
 * Email Logs tab and the candidate/evaluation Email tabs so the three lists
 * that surface the same underlying data all open the same detail UI.
 */
export function EmailMessageDetailModal({
  message,
  onOpenChange,
}: {
  message: EmailMessageListItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [attachments, setAttachments] = useState<EmailAttachmentItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!message) {
      setAttachments([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const res = await fetch(`/api/admin/email/messages/${message.id}`, {
        credentials: "include",
      });
      const json = (await res.json()) as { attachments?: EmailAttachmentItem[] };
      if (!cancelled) setAttachments(json.attachments ?? []);
    })().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [message]);

  return (
    <Modal.Backdrop
      className="bg-black/40 backdrop-blur-sm"
      isOpen={!!message}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-2xl overflow-hidden p-0">
          <Modal.CloseTrigger />
          {/* `!flex-row`: HeroUI's own `.modal__header` is `flex-col` and
              wins the cascade over a plain `flex` here, which would make
              `items-center` center this row's content horizontally instead
              of vertically. */}
          <Modal.Header className="!flex-row flex items-center justify-between gap-3 border-b border-divider px-6 py-5">
            <Modal.Heading>Email Details</Modal.Heading>
            {message ? (
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${EMAIL_STATUS_STYLES[message.status] ?? ""}`}
                >
                  {message.status}
                </span>
                {message.retry_count > 0 ? (
                  <span className="text-xs text-muted">
                    retried {message.retry_count}x
                  </span>
                ) : null}
              </div>
            ) : null}
          </Modal.Header>
          <Modal.Body className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-5">
            {message ? (
              <>
                {message.error_message ? (
                  <Alert status="danger" className="rounded-xl">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Description>{message.error_message}</Alert.Description>
                    </Alert.Content>
                  </Alert>
                ) : null}

                <EmailPreviewCard
                  subject={message.subject}
                  bodyHtml={message.body_html}
                  to={message.to_email}
                  cc={message.cc}
                  bcc={message.bcc}
                  fromEmail={message.from_email}
                  dateLabel={
                    message.sent_at ? formatDisplayDateTime(message.sent_at) : undefined
                  }
                  bodyMinHeightClassName="min-h-[8rem]"
                />

                {loading ? (
                  <p className="text-xs text-muted">Loading attachments…</p>
                ) : attachments.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-semibold text-muted">Attachments</p>
                    {attachments.map((a) => (
                      <p key={a.id} className="text-xs text-foreground">
                        {a.file_name}
                      </p>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
