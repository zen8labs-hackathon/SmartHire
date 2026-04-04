import { redirect } from "next/navigation";

import { ChaptersSetup } from "@/components/admin/chapters-setup";
import { getStaffProfileAccess } from "@/lib/admin/profile-access";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminChaptersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/chapters");
  const access = await getStaffProfileAccess(supabase, user.id);
  if (!access?.isHr) redirect("/admin/jd");

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, name")
    .order("name", { ascending: true });

  return <ChaptersSetup initialChapters={chapters ?? []} />;
}
