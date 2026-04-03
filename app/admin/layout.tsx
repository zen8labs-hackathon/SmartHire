import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminSidebarNav } from "@/components/admin/admin-sidebar-nav";
import { isProfileAdmin } from "@/lib/admin/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/admin");
  }
  if (!(await isProfileAdmin(supabase, user.id))) {
    redirect("/dashboard");
  }

  const display = user.email ?? "Admin";

  return (
    <div className="flex min-h-full flex-1">
      <aside className="flex w-56 shrink-0 flex-col border-r border-divider bg-surface-secondary px-4 py-6">
        <Link
          href="/dashboard"
          className="mb-6 text-sm font-semibold text-foreground hover:underline"
        >
          Smart Hire
        </Link>
        <AdminSidebarNav />
        <div className="mt-auto pt-8 text-xs text-muted">
          <p className="truncate font-medium text-foreground">{display}</p>
          <p className="mt-1">Admin</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
