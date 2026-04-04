import { redirect } from "next/navigation";

import { CandidateEvaluationTemplateManager } from "@/components/admin/candidate-evaluation-template/candidate-evaluation-template-manager";
import { getStaffProfileAccess } from "@/lib/admin/profile-access";
import { createClient } from "@/lib/supabase/server";

export default async function AdminEvaluationTemplatePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/evaluation-template");
  const access = await getStaffProfileAccess(supabase, user.id);
  if (!access?.isHr) redirect("/admin/jd");

  return <CandidateEvaluationTemplateManager />;
}
