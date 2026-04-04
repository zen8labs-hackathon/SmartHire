import type { CandidateRow, CandidateStatus } from "@/lib/candidates/types";

export function candidateDisplayInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? "";
  return `${a}${b}`.toUpperCase() || "?";
}

export function jdMatchChipColor(
  row: CandidateRow,
): "success" | "accent" | "danger" | "default" {
  if (row.jdMatchScore == null) return "default";
  if (row.jdMatchScore >= 75) return "success";
  if (row.jdMatchScore >= 50) return "accent";
  return "danger";
}

export function candidateStatusChipColor(
  status: CandidateStatus,
): "success" | "accent" | "danger" | "warning" | "default" {
  switch (status) {
    case "Interviewing":
      return "success";
    case "Shortlisted":
      return "accent";
    case "Offer":
      return "warning";
    case "Failed":
    case "Rejected":
      return "danger";
    case "Matched":
      return "success";
    default:
      return "default";
  }
}
