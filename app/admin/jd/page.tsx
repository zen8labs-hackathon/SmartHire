import { JdManagementDashboard } from "@/components/admin/jd/jd-management-dashboard";
import { getStaffProfileAccess } from "@/lib/admin/profile-access";
import { createClient } from "@/lib/supabase/server";

export default async function AdminJdPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const access = user ? await getStaffProfileAccess(supabase, user.id) : null;

  const { data: chapterRows } = await supabase
    .from("chapters")
    .select("id, name")
    .order("name", { ascending: true });

  return (
    <JdManagementDashboard
      canManageJds={access?.isHr === true}
      chapters={chapterRows ?? []}
    />
  );
}
