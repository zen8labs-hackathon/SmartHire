import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminSidebarNav } from "@/components/admin/admin-sidebar-nav";
import { ToastProvider } from "@/components/admin/toast-provider";
import { getRequestAuth } from "@/lib/admin/request-auth";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // getRequestAuth() memoizes the getUser()/getStaffProfileAccess() work for
  // the whole request via React's cache() -- the nested page.tsx for this
  // route reuses the same resolved result instead of re-verifying the JWT.
  const { user, access } = await getRequestAuth();

  if (!user) {
    redirect("/login?next=/admin");
  }
  if (!access?.isStaff) {
    redirect("/dashboard");
  }

  const display = user.email ?? "Recruiting";

  return (
    <div className="flex min-h-full flex-1">
      <aside className="flex w-56 shrink-0 flex-col border-r border-divider bg-surface-secondary px-4 py-6">
        <Link
          href="/dashboard"
          className="mb-6 text-sm font-semibold text-foreground hover:underline"
        >
          Smart Hire
        </Link>
        <AdminSidebarNav isHr={access.isHr} />
        <div className="mt-auto pt-8 text-xs text-muted">
          <p className="truncate font-medium text-foreground">{display}</p>
          <p className="mt-1">{access.isHr ? "HR" : "Recruiter"}</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
