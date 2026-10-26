import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ToastProvider } from "@/components/admin/toast-provider";
import { getStaffProfileAccess } from "@/lib/admin/profile-access";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/session";
import { getPool } from "@/lib/db/config/client";
import { MigrationApp } from "./migration-app";
import "../position-management-2/jobs.css";

export default async function MigrationLayout({ children }: { children: React.ReactNode }) {
  const db = getPool();
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  const claims = token ? await verifyAccessToken(token) : null;
  const access = claims ? await getStaffProfileAccess(db, claims.sub) : null;
  if (!access?.isHr) redirect("/admin/jd");
  const viewer = {
    name: access?.username ?? "You",
    role: access?.isAdmin ? "Admin" : access?.isHr ? "HR" : "Recruiter",
    canEdit: !!access?.isHr,
  };
  return (
    <ToastProvider>
      <MigrationApp embedded viewer={viewer} />
      {children}
    </ToastProvider>
  );
}
