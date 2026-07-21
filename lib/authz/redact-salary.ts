import type { CampaignAppliedAdminRow } from "@/lib/db/campaign-applied-list";

/** Strip expected_salary when the caller lacks salary.view. */
export function redactExpectedSalary<T extends { expected_salary?: string | null }>(
  row: T,
  canView: boolean,
): T {
  if (canView) return row;
  return { ...row, expected_salary: null };
}

export function redactAdminRowSalary(
  row: CampaignAppliedAdminRow,
  canView: boolean,
): CampaignAppliedAdminRow {
  return redactExpectedSalary(row, canView);
}
