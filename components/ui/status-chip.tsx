import type { LucideIcon } from "lucide-react";
import {
  Ban,
  Check,
  CircleX,
  Clock,
  Copy,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";

export type ChipTone =
  | "neutral"
  | "outline"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "ai"
  | "highlight"
  | "lock"
  | "dashed";

type StatusKey =
  | "queued"
  | "uploading"
  | "processing"
  | "parsing"
  | "needs_review"
  | "done"
  | "parsed"
  | "failed"
  | "cancelled"
  | "duplicate";

const STATUS_MAP: Record<StatusKey, [ChipTone, LucideIcon, string, boolean?]> = {
  queued: ["neutral", Clock, "Queued"],
  uploading: ["info", LoaderCircle, "Uploading", true],
  processing: ["info", LoaderCircle, "Processing", true],
  parsing: ["info", LoaderCircle, "Parsing", true],
  needs_review: ["warning", TriangleAlert, "Needs review"],
  done: ["success", Check, "Done"],
  parsed: ["success", Check, "Parsed"],
  failed: ["danger", CircleX, "Failed"],
  cancelled: ["neutral", Ban, "Cancelled"],
  duplicate: ["outline", Copy, "Duplicate found"],
};

type ChipProps = {
  tone?: ChipTone;
  icon?: LucideIcon;
  spin?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
};

/** Generic DS chip: 22px, radius 6, 12px/500. Pair with an icon for status. */
export function Chip({ tone = "neutral", icon: Icon, spin, className, title, children }: ChipProps) {
  return (
    <span className={`sh-chip sh-chip--${tone}${className ? ` ${className}` : ""}`} title={title}>
      {Icon ? <Icon size={12} aria-hidden className={spin ? "sh-spin" : undefined} /> : null}
      {children}
    </span>
  );
}

type StatusChipProps = {
  status: StatusKey | (string & {});
  label?: ReactNode;
  className?: string;
};

/** Pipeline / processing status chip. Always renders icon + text. */
export function StatusChip({ status, label, className }: StatusChipProps) {
  const entry = STATUS_MAP[status as StatusKey] ?? STATUS_MAP.queued;
  const [tone, Icon, text, spin] = entry;
  return (
    <Chip tone={tone} icon={Icon} spin={spin} className={className}>
      {label ?? text}
    </Chip>
  );
}
