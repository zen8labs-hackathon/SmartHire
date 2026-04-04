import { CandidatePipelineDashboard } from "@/components/admin/candidates/candidate-pipeline-dashboard";
import { ADMIN_CANDIDATES_SELECT } from "@/lib/candidates/admin-select";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import { isProfileAdmin } from "@/lib/admin/config";
import { createClient } from "@/lib/supabase/server";

export default async function AdminCandidatesPage() {
  let initialRows: CandidateDbRow[] | undefined;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && (await isProfileAdmin(supabase, user.id))) {
      const { data } = await supabase
        .from("candidates")
        .select(ADMIN_CANDIDATES_SELECT)
        .order("jd_match_score", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      initialRows = (data ?? []) as CandidateDbRow[];
    }
  } catch {
    // Fall through — dashboard will fetch client-side via API route
  }

  return <CandidatePipelineDashboard initialRows={initialRows} />;
}
