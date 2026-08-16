"use client";

import type { ReactNode } from "react";

import { HighlightedText } from "@/components/admin/email-config/highlighted-text";
import { highlightUnresolvedPlaceholdersHtml } from "@/lib/email/highlight-unresolved-placeholders";

/**
 * Shared "email client" preview visual (subject line, sender/recipient pane
 * with avatar, rendered HTML body) so every compose/preview flow -- template
 * form, bulk send, single send -- renders the same look instead of each
 * reinventing its own preview card. Also the single choke point for
 * highlighting unresolved `{{key}}` placeholders in red: every preview
 * surface in the app renders through this component, so flagging it here
 * once covers all of them instead of each caller remembering to do it.
 */
/** First 2 characters of the sender's local-part (before `@`), matching the
 * initials pattern used for user avatars elsewhere (`user-modal.tsx`,
 * `sidebar.tsx`). */
function emailInitials(email: string): string {
  const localPart = email.split("@")[0] || email;
  return localPart.slice(0, 2).toUpperCase();
}

export function EmailPreviewCard({
  subject,
  bodyHtml,
  to,
  cc,
  bcc,
  dateLabel,
  fromName = "SmartHire Recruiting",
  fromEmail = "recruiting@smart-hire.test",
  bodyMinHeightClassName = "min-h-[16rem]",
}: {
  subject: string;
  bodyHtml: string;
  to: ReactNode;
  cc?: string | null;
  bcc?: string | null;
  dateLabel?: string;
  fromName?: string;
  fromEmail?: string;
  bodyMinHeightClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-divider bg-surface-primary overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-divider bg-surface-secondary/10 p-4">
        <div className="flex gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 font-bold text-accent">
            {emailInitials(fromEmail)}
          </div>
          <div className="space-y-1.5 min-w-0">
            <h2 className="text-base font-bold text-foreground leading-tight">
              {subject ? <HighlightedText text={subject} /> : "(No Subject)"}
            </h2>
            <div className="flex items-center gap-1.5 flex-wrap text-sm">
              <span className="font-semibold text-foreground">{fromName}</span>
              <span className="text-xs text-muted">&lt;{fromEmail}&gt;</span>
            </div>
            <div className="text-xs text-muted-foreground flex flex-col gap-0.5">
              <div className="truncate">
                <span className="font-medium text-muted">To: </span>
                <span className="font-mono">{to}</span>
              </div>
              {cc ? (
                <div className="truncate">
                  <span className="font-medium text-muted">Cc: </span>
                  <span className="font-mono">{cc}</span>
                </div>
              ) : null}
              {bcc ? (
                <div className="truncate">
                  <span className="font-medium text-muted">Bcc: </span>
                  <span className="font-mono">{bcc}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {dateLabel ? (
          <div className="text-right text-[11px] text-muted shrink-0 pt-0.5">{dateLabel}</div>
        ) : null}
      </div>

      <div className={`p-6 ${bodyMinHeightClassName}`}>
        <div
          className="email-html-preview max-w-none text-foreground text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: highlightUnresolvedPlaceholdersHtml(bodyHtml) }}
        />
      </div>
    </div>
  );
}
