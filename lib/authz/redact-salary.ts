import type { StaffProfileAccess } from "@/lib/admin/profile-access";
import { canViewSalary } from "@/lib/authz/can";
import type { CampaignAppliedAdminRow } from "@/lib/db/campaign-applied-list";
import type { QueryExecutor } from "@/lib/db/config/client";

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

/** Redact a single application row using the caller's salary ACL for its job. */
export async function redactAdminRowSalaryForAccess(
  db: QueryExecutor,
  access: StaffProfileAccess,
  row: CampaignAppliedAdminRow,
): Promise<CampaignAppliedAdminRow> {
  const canView = await canViewSalary(db, access, row.job_id);
  return redactAdminRowSalary(row, canView);
}
