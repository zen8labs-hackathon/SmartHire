import { redirect } from "next/navigation";

import { CandidatePipelineKanbanLoader } from "../candidate-pipeline-kanban-loader";
import { ADMIN_CANDIDATES_LIST_SELECT } from "@/lib/candidates/admin-select";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import { enrichCandidatesWithJobOpenings } from "@/lib/candidates/enrich-candidates-job-openings";
import { getStaffProfileAccess } from "@/lib/admin/profile-access";
import { createClient } from "@/lib/supabase/server";

export default async function AdminCandidatesKanbanPage() {
  let initialRows: CandidateDbRow[] | undefined;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login?next=/admin/candidates/v2");
    const access = await getStaffProfileAccess(supabase, user.id);
    if (!access?.isHr) redirect("/admin/jd");

    const { data } = await supabase
      .from("candidates")
      .select(ADMIN_CANDIDATES_LIST_SELECT)
      .eq("is_active", true)
      .order("cv_uploaded_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    const raw = (data ?? []) as unknown as CandidateDbRow[];
    initialRows = await enrichCandidatesWithJobOpenings(supabase, raw);
  } catch {
    // Fall through — board will fetch client-side via API route
  }

  return <CandidatePipelineKanbanLoader initialRows={initialRows} />;
}
