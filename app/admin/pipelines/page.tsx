import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pipelines | Smart Hire Admin",
  description: "Configure candidate pipeline stages and sub-stages.",
};

import { PipelineManager } from "@/components/admin/pipeline-manager";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { getPool } from "@/lib/db/config/client";
import { listPipelineStages } from "@/lib/db/pipeline-stages";
import type { PipelineStageRow } from "@/lib/pipelines/schemas";
import { PageHeader } from "@/components/admin/shell/page-header";

async function getPipelineStages(): Promise<PipelineStageRow[]> {
  const rows = await listPipelineStages(getPool());
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    label: r.label,
    desc: r.desc,
    color: r.color,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  }));
}

export default async function AdminPipelinesPage() {
  const { user, access } = await getRequestAuth();

  if (!user) {
    redirect("/login?next=/admin/pipelines");
  }

  if (!access?.isHr) {
    redirect("/admin/jd");
  }

  const stagesPromise = getPipelineStages();

  return (
    <div className="flex flex-col gap-6 font-sans">
      <PageHeader
        title="Pipeline Management"
        description="Configure hiring pipeline stages, sub-stages, status triggers, and evaluation criteria."
      />

      <PipelineManager stagesPromise={stagesPromise} />
    </div>
  );
}
