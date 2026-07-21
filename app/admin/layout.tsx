import { redirect } from "next/navigation";

import { DashboardLayout } from "@/components/admin/shell/dashboard-layout";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { hasAdminAccess, hasRolePermission } from "@/lib/authz/can";

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
  if (!access || !hasAdminAccess(access)) {
    redirect("/dashboard");
  }

  const canManage =
    access.isHr || hasRolePermission(access, "job.manage");

  return (
    <DashboardLayout
      userEmail={user.email ?? ""}
      isHr={canManage}
      chapterIds={access.chapterIds}
    >
      {children}
    </DashboardLayout>
  );
}
