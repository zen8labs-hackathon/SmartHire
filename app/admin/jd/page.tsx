import { JdManagementDashboard } from "@/components/admin/jd/jd-management-dashboard";
import { getStaffProfileAccess } from "@/lib/admin/profile-access";
import { createClient } from "@/lib/supabase/server";

export default async function AdminJdPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const access = user ? await getStaffProfileAccess(supabase, user.id, user) : null;

  const [chapterRowsRes, pipelineStagesRes] = await Promise.all([
    supabase
      .from("chapters")
      .select("id, name")
      .order("name", { ascending: true }),
    supabase
      .from("pipeline_stages")
      .select("id, label, code, color")
      .is("deleted_at", null)
      .order("label", { ascending: true }),
  ]);

  const chapterRows = chapterRowsRes.data;
  const pipelineStages = pipelineStagesRes.data;

  return (
    <JdManagementDashboard
      canManageJds={access?.isHr === true}
      chapters={chapterRows ?? []}
      allPipelineStages={pipelineStages ?? []}
    />
  );
}
