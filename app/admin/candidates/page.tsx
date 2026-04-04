import { CandidatePipelineDashboardLoader } from "./candidate-pipeline-dashboard-loader";
import { ADMIN_CANDIDATES_SELECT } from "@/lib/candidates/admin-select";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import { enrichCandidatesWithJobOpenings } from "@/lib/candidates/enrich-candidates-job-openings";
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
        .order("cv_uploaded_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      const raw = (data ?? []) as unknown as CandidateDbRow[];
      initialRows = await enrichCandidatesWithJobOpenings(supabase, raw);
    }
  } catch {
    // Fall through — dashboard will fetch client-side via API route
  }

  return <CandidatePipelineDashboardLoader initialRows={initialRows} />;
}
