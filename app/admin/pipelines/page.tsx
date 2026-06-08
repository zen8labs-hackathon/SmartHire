import { redirect } from "next/navigation";

import { PipelineManager } from "@/components/admin/pipeline-manager";
import { getStaffProfileAccess } from "@/lib/admin/profile-access";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminPipelinesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/admin/pipelines");
  }

  const access = await getStaffProfileAccess(supabase, user.id);
  if (!access?.isHr) {
    redirect("/admin/jd");
  }

  return <PipelineManager />;
}
