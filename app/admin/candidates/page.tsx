import { CandidatePipelineDashboard } from "@/components/admin/candidates/candidate-pipeline-dashboard";
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
        .select(
          "id, job_opening_id, cv_storage_path, original_filename, mime_type, parsing_status, parsing_error, parsed_payload, name, role, avatar_url, experience_years, skills, degree, school, status, chapter, created_at, updated_at",
        )
        .order("created_at", { ascending: false });
      initialRows = (data ?? []) as CandidateDbRow[];
    }
  } catch {
    // Fall through — dashboard will fetch client-side via API route
  }

  return <CandidatePipelineDashboard initialRows={initialRows} />;
}
