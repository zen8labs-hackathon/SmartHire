import { redirect } from "next/navigation";

import { DashboardLayout } from "@/components/admin/shell/dashboard-layout";
import { getRequestAuth } from "@/lib/admin/request-auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayoutWrapper({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, access } = await getRequestAuth();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  return (
    <DashboardLayout
      userEmail={user.email ?? ""}
      isHr={access?.isHr === true}
      chapterIds={access?.chapterIds ?? []}
    >
      {children}
    </DashboardLayout>
  );
}
