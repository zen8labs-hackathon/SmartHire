import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ToastProvider } from "@/components/admin/toast-provider";
import { getStaffProfileAccess } from "@/lib/admin/profile-access";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/session";
import { getPool } from "@/lib/db/config/client";
import { CandidatesApp } from "./candidates-app";
import "../position-management-2/jobs.css";
import "./candidates.css";

export default async function Candidates2Layout({ children }: { children: React.ReactNode }) {
  const db = getPool();
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  const claims = token ? await verifyAccessToken(token) : null;
  const access = claims ? await getStaffProfileAccess(db, claims.sub) : null;
  if (!access?.isHr) redirect("/admin/jd");
  return (
    <ToastProvider>
      <CandidatesApp embedded />
      {children}
    </ToastProvider>
  );
}
