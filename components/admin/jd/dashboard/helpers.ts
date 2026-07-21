import type { JdStatus } from "@/lib/jd/types";
import { formatDisplayDate } from "@/lib/format-date";

export const LEGACY_HIRE_TYPE_VI_TO_EN: Record<string, string> = {
  "Tuyển mới": "New hire",
  "Tuyển thay thế": "Replacement",
};

export function normalizeHireTypeForForm(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  return LEGACY_HIRE_TYPE_VI_TO_EN[t] ?? t;
}

export function formatHireTypeDisplay(raw: string | null | undefined): string {
  return normalizeHireTypeForForm(raw);
}

export function statusChipColor(
  status: JdStatus,
): "success" | "warning" | "default" | "accent" | "danger" {
  switch (status) {
    case "Hiring":
      return "success";
    case "Pending":
      return "warning";
    case "Done":
      return "accent";
    case "Closed":
      return "danger";
    default:
      return "default";
  }
}

/** Border + background tint for JD status dropdown triggers. */
export function jdStatusSelectTriggerClass(status: JdStatus): string {
  switch (status) {
    case "Hiring":
      return "border-success/45 bg-success/10 text-success";
    case "Pending":
      return "border-warning/45 bg-warning/10 text-warning";
    case "Done":
      return "border-accent/45 bg-accent/10 text-accent";
    case "Closed":
      return "border-danger/40 bg-danger/10 text-danger";
    default:
      return "border-divider";
  }
}

export function jdStatusListItemClass(status: JdStatus): string {
  switch (status) {
    case "Hiring":
      return "text-success";
    case "Pending":
      return "text-warning";
    case "Done":
      return "text-accent";
    case "Closed":
      return "text-danger";
    default:
      return "";
  }
}

export function jdRowDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export function formatJdCalendarDate(value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  const ymd = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "—";
  return formatDisplayDate(ymd);
}

export function formatDate(iso: string) {
  return formatDisplayDate(iso);
}
