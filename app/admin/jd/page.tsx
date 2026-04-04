import { JdManagementDashboard } from "@/components/admin/jd/jd-management-dashboard";
import { getStaffProfileAccess } from "@/lib/admin/profile-access";
import { createClient } from "@/lib/supabase/server";

export default async function AdminJdPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const access = user ? await getStaffProfileAccess(supabase, user.id) : null;

  return (
    <JdManagementDashboard canManageJds={access?.isHr === true} />
  );
}
