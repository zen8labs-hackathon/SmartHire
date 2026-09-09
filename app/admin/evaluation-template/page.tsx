import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Evaluation Template | Smart Hire Admin",
  description: "Manage the shared HR/admin interview evaluation template library.",
};

import { CandidateEvaluationTemplateManager } from "@/components/admin/candidate-evaluation-template/candidate-evaluation-template-manager";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { PageHeader } from "@/components/admin/shell/page-header";

export default async function AdminEvaluationTemplatePage() {
  const { user, access } = await getRequestAuth();
  if (!user) redirect("/login?next=/admin/evaluation-template");
  if (!access?.isHr) redirect("/admin/jd");

  return (
    <div className="flex flex-col gap-4 font-sans">
      <PageHeader
        title="Evaluation Template"
        description="Build a library of reusable interview evaluation templates -- attach one to a job when you create it."
      />

      <CandidateEvaluationTemplateManager currentUserId={user.id} />
    </div>
  );
}
