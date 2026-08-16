"use client";

import { useEffect, useState, type ReactNode } from "react";

import { EmailListInput } from "@/components/admin/email-config/email-list-input";

/**
 * `border-0`/`shadow-none` alone don't fully suppress HeroUI's `.input` base
 * class (it applies `border-radius` and a `--field-shadow` box-shadow
 * independent of border-width), so both are spelled out here to get a truly
 * flat, borderless row like Gmail/Outlook's compose header.
 */
const ROW_INPUT_CLASSNAME =
  "h-7 w-full rounded-none border-0 bg-transparent px-0 text-sm text-foreground shadow-none outline-none focus:outline-none focus:ring-0 placeholder:text-muted/70";

/**
 * Gmail/Outlook-style compose header: From/To/Subject as plain inline rows
 * (no per-field boxes), Cc/Bcc collapsed behind toggle links next to To and
 * revealed on demand. `children` renders the body editor inside the same
 * card so the whole composer reads as one surface.
 */
export function EmailComposerFields({
  from,
  to,
  cc,
  onCcChange,
  bcc,
  onBccChange,
  subject,
  onSubjectChange,
  subjectPlaceholder,
  disabled,
  children,
}: {
  from?: string;
  to: ReactNode;
  cc: string;
  onCcChange: (value: string) => void;
  bcc: string;
  onBccChange: (value: string) => void;
  subject: string;
  onSubjectChange: (value: string) => void;
  subjectPlaceholder?: string;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const [showCc, setShowCc] = useState(() => cc.trim().length > 0);
  const [showBcc, setShowBcc] = useState(() => bcc.trim().length > 0);

  // `cc`/`bcc` can change after mount (e.g. a template selection filling in
  // its default_cc) -- reveal the row once a value shows up rather than only
  // checking it once at mount time.
  useEffect(() => {
    if (cc.trim().length > 0) setShowCc(true);
  }, [cc]);
  useEffect(() => {
    if (bcc.trim().length > 0) setShowBcc(true);
  }, [bcc]);

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-divider bg-surface-primary shadow-sm">
      <div className="divide-y divide-divider/60 bg-surface-secondary/15 px-4">
        {from ? (
          <div className="flex items-center gap-3 py-2.5">
            <span className="w-14 shrink-0 text-xs font-semibold text-muted">From</span>
            <span className="truncate font-mono text-xs text-muted">{from}</span>
          </div>
        ) : null}

        <div className="flex items-start gap-3 py-2.5">
          <span className="w-14 shrink-0 pt-1 text-xs font-semibold text-muted">To</span>
          <div className="flex max-h-20 flex-1 flex-wrap items-center gap-1.5 overflow-y-auto">
            {to}
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-1">
            {!showCc ? (
              <button
                type="button"
                className="text-xs font-semibold text-muted hover:text-foreground"
                onClick={() => setShowCc(true)}
              >
                Cc
              </button>
            ) : null}
            {!showBcc ? (
              <button
                type="button"
                className="text-xs font-semibold text-muted hover:text-foreground"
                onClick={() => setShowBcc(true)}
              >
                Bcc
              </button>
            ) : null}
          </div>
        </div>

        {showCc ? (
          <div className="flex items-center gap-3 py-2">
            <span className="w-14 shrink-0 text-xs font-semibold text-muted">Cc</span>
            <div className="flex-1">
              <EmailListInput
                value={cc}
                onChange={onCcChange}
                label=""
                disabled={disabled}
                placeholder="comma-separated emails"
                inputClassName={ROW_INPUT_CLASSNAME}
              />
            </div>
          </div>
        ) : null}

        {showBcc ? (
          <div className="flex items-center gap-3 py-2">
            <span className="w-14 shrink-0 text-xs font-semibold text-muted">Bcc</span>
            <div className="flex-1">
              <EmailListInput
                value={bcc}
                onChange={onBccChange}
                label=""
                disabled={disabled}
                placeholder="comma-separated emails"
                inputClassName={ROW_INPUT_CLASSNAME}
              />
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-3 py-2.5">
          <span className="w-14 shrink-0 text-xs font-semibold text-muted">Subject</span>
          <input
            value={subject}
            onChange={(e) => onSubjectChange(e.target.value)}
            disabled={disabled}
            placeholder={subjectPlaceholder}
            className={`${ROW_INPUT_CLASSNAME} font-semibold`}
          />
        </div>
      </div>

      {children ? <div className="bg-surface-primary p-4">{children}</div> : null}
    </div>
  );
}
