import { Chip, type ChipTone } from "./status-chip";
import { Check, CircleX, Clock, LoaderCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type AsyncKind = "upload" | "extraction" | "scoring" | "pdf";
export type AsyncState = "queued" | "running" | "done" | "failed";

const NOUN: Record<AsyncKind, { running: string; done: string; failed: string }> = {
  upload: { running: "Uploading", done: "Uploaded", failed: "Upload failed" },
  extraction: { running: "Extracting text", done: "Text extracted", failed: "Extraction failed" },
  scoring: { running: "Scoring", done: "Scored", failed: "Scoring failed" },
  pdf: { running: "Generating PDF", done: "PDF ready", failed: "PDF failed" },
};

const STATE: Record<AsyncState, [ChipTone, LucideIcon, boolean]> = {
  queued: ["neutral", Clock, false],
  running: ["info", LoaderCircle, true],
  done: ["success", Check, false],
  failed: ["danger", CircleX, false],
};

/** Specific, actionable wording instead of a bare "Failed". */
export function asyncLabel(kind: AsyncKind, state: AsyncState, reason?: string): string {
  if (state === "queued") return "Queued";
  const base = NOUN[kind][state];
  return state === "failed" && reason ? `${base}: ${reason}` : base;
}

export type AsyncStatusChipProps = {
  kind: AsyncKind;
  state: AsyncState;
  /** Why it failed, e.g. "file is password-protected". Shown in the label and tooltip. */
  reason?: string;
  className?: string;
};

/** One chip for upload / extraction / scoring / PDF generation (F0.3). */
export function AsyncStatusChip({ kind, state, reason, className }: AsyncStatusChipProps) {
  const [tone, icon, spin] = STATE[state];
  const label = asyncLabel(kind, state, reason);
  return (
    <span role={state === "failed" ? "alert" : "status"}>
      <Chip tone={tone} icon={icon} spin={spin} className={className} title={label}>
        {label}
      </Chip>
    </span>
  );
}
