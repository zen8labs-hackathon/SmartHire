import { redirect } from "next/navigation";

import { CandidatePipelineDashboardLoader } from "./candidate-pipeline-dashboard-loader";
import {
  CANDIDATES_LIST_DEFAULT_LIMIT,
  queryCandidatesList,
} from "@/lib/candidates/candidates-list-query";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import { getStaffProfileAccess } from "@/lib/admin/profile-access";
import { createClient } from "@/lib/supabase/server";

export default async function AdminCandidatesPage() {
  let initialRows: CandidateDbRow[] | undefined;
  let initialListTotal: number | undefined;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login?next=/admin/candidates");
    const access = await getStaffProfileAccess(supabase, user.id);
    if (!access?.isHr) redirect("/admin/jd");

    const result = await queryCandidatesList(supabase, {
      limit: CANDIDATES_LIST_DEFAULT_LIMIT,
      offset: 0,
    });
    initialRows = result.candidates;
    initialListTotal = result.pagination?.total;
  } catch {
    // Fall through — dashboard will fetch client-side via API route
  }

  return (
    <CandidatePipelineDashboardLoader
      initialRows={initialRows}
      initialListTotal={initialListTotal}
    />
  );
}
