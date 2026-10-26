import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ToastProvider } from "@/components/admin/toast-provider";
import { getStaffProfileAccess } from "@/lib/admin/profile-access";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/session";
import { getPool } from "@/lib/db/config/client";
import { getPipelineLibrary, getPipelines } from "@/lib/pipelines/get-pipelines";
import { PipelinesApp } from "./pipelines-app";
import "../position-management-2/jobs.css";
import "./pipelines.css";

export default async function Pipelines2Layout({ children }: { children: React.ReactNode }) {
  const db = getPool();
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  const claims = token ? await verifyAccessToken(token) : null;
  const [access, library, pipelines] = await Promise.all([
    claims ? getStaffProfileAccess(db, claims.sub) : null,
    getPipelineLibrary(db),
    getPipelines(db),
  ]);
  if (!access?.isHr) redirect("/admin/jd");
  const viewer = {
    name: access?.username ?? "You",
    role: access?.isAdmin ? "Admin" : access?.isHr ? "HR" : "Recruiter",
    canEdit: !!access?.isHr,
  };
  return (
    <ToastProvider>
      <PipelinesApp embedded initialLibrary={library} initialPipelines={pipelines} viewer={viewer} />
      {children}
    </ToastProvider>
  );
}
