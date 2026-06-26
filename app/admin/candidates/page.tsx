import { redirect } from "next/navigation";

import { CandidatePipelineDashboardLoader } from "./candidate-pipeline-dashboard-loader";
import { getStaffProfileAccess } from "@/lib/admin/profile-access";
import { createClient } from "@/lib/supabase/server";

export default async function AdminCandidatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/admin/candidates");
  const access = await getStaffProfileAccess(supabase, user.id, user);
  if (!access?.isHr) redirect("/admin/jd");

  return <CandidatePipelineDashboardLoader />;
}
