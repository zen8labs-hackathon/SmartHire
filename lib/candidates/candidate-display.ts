import type { CandidateStatus } from "@/lib/candidates/types";

/** Trimmed Unicode uppercase so uploaded CV names display as "ĐÀO QUỐC HUY". */
export function canonicalizeCandidateName(
  name: string | null | undefined,
): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed.toLocaleUpperCase("vi-VN");
}

export function candidateDisplayInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? "";
  return `${a}${b}`.toUpperCase() || "?";
}

export function jdMatchChipColor(row: {
  jdMatchScore: number | null;
}): "success" | "accent" | "danger" | "default" {
  if (row.jdMatchScore == null) return "default";
  if (row.jdMatchScore >= 75) return "success";
  if (row.jdMatchScore >= 50) return "accent";
  return "danger";
}

export function candidateStatusChipColor(
  status: CandidateStatus,
): "success" | "accent" | "danger" | "warning" | "default" {
  switch (status) {
    case "CvPassed":
    case "InterviewPassed":
    case "Matched":
      return "success";
    case "Consider":
    case "InterviewConsider":
    case "Interview":
      return "accent";
    case "Offer":
      return "warning";
    case "CvFailed":
    case "InterviewFailed":
    case "Rejected":
      return "danger";
    case "InterviewCanceled":
      return "default";
    case "New":
    default:
      return "default";
  }
}
