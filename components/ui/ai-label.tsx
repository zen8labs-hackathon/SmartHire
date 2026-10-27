"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type AiState = "unconfirmed" | "confirmed" | "edited";

/** Where an AI value came from (UX-05). */
export type AiSource =
  | { kind: "jd"; page: number }
  | { kind: "cv"; quote?: string }
  | { kind: "other"; text: string };

export type AiProvenance = {
  model: string;
  /** ISO timestamp or Date. */
  generatedAt: string | Date;
  source?: AiSource;
  state: AiState;
};

const STATE_LABEL: Record<AiState, string> = {
  unconfirmed: "Unconfirmed",
  confirmed: "Confirmed",
  edited: "Edited by a person",
};

export function describeAiSource(source: AiSource): string {
  if (source.kind === "jd") return `From JD p.${source.page}`;
  if (source.kind === "cv") return source.quote ? `Quoted from CV: “${source.quote}”` : "Quoted from CV";
  return source.text;
}

function formatWhen(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "Unknown time";
  // Fixed locale/timezone so server and client render the same text.
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

type AiLabelProps = {
  /** Full provenance — takes precedence over what/evidence/how. */
  provenance?: AiProvenance;
  edited?: boolean;
  /** What the AI produced. */
  what?: string;
  /** Evidence the output is based on. */
  evidence?: string;
  /** How it was produced. */
  how?: string;
  className?: string;
};

/**
 * Marks AI-generated content. Violet is reserved for AI.
 * When explanation props are given, clicking opens a short "AI-generated" popover.
 */
export function AiLabel({ provenance, edited: editedProp, what, evidence, how, className }: AiLabelProps) {
  const edited = editedProp ?? provenance?.state === "edited";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const hasDetails = Boolean(provenance || what || evidence || how);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const cls = `sh-ailabel${edited ? " sh-ailabel--edited" : ""}${className ? ` ${className}` : ""}`;
  const content = (
    <>
      <Sparkles size={11} aria-hidden />
      {edited ? "Edited" : "AI"}
      {provenance?.state === "unconfirmed" ? <span className="sr-only"> (unconfirmed)</span> : null}
    </>
  );

  if (!hasDetails) {
    return (
      <span className={cls} title={edited ? "AI-generated, edited by a person" : "AI-generated"}>
        {content}
      </span>
    );
  }

  return (
    <span ref={ref} className="relative inline-flex">
      <button type="button" className={cls} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)}>
        {content}
      </button>
      {open ? (
        <span
          role="dialog"
          aria-label="AI-generated content details"
          className="sh-popover absolute left-0 top-[calc(100%+6px)] z-50 flex w-[280px] flex-col gap-2 p-3 text-caption text-foreground"
        >
          <span className="flex items-center gap-1.5 font-semibold text-ai">
            <Sparkles size={12} aria-hidden />
            AI-generated
          </span>
          {provenance ? (
            <>
              <Row label="Model">{provenance.model}</Row>
              <Row label="Time">{formatWhen(provenance.generatedAt)}</Row>
              {provenance.source ? <Row label="Source">{describeAiSource(provenance.source)}</Row> : null}
              <Row label="State">{STATE_LABEL[provenance.state]}</Row>
            </>
          ) : null}
          {what ? <Row label="What">{what}</Row> : null}
          {evidence ? <Row label="Evidence">{evidence}</Row> : null}
          {how ? <Row label="How">{how}</Row> : null}
        </span>
      ) : null}
    </span>
  );
}

function Row({ label, children }: { label: string; children: string }) {
  return (
    <span className="flex gap-2">
      <span className="w-16 shrink-0 text-muted">{label}</span>
      <span className="text-fg-2">{children}</span>
    </span>
  );
}
