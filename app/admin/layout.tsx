import { redirect } from "next/navigation";

import { DashboardLayout } from "@/components/admin/shell/dashboard-layout";
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

  return (
    <DashboardLayout
      userEmail={user.email ?? ""}
      isHr={access.isHr}
      workChapter={access.workChapter}
      chapterIds={access.chapterIds}
    >
      {children}
    </DashboardLayout>
  );
}
