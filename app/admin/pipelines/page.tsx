import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pipelines | Smart Hire Admin",
  description: "Configure candidate pipeline stages and sub-stages.",
};

import { PipelineManager } from "@/components/admin/pipeline-manager";
import { getRequestAuth } from "@/lib/admin/request-auth";
import type { PipelineStageRow } from "@/lib/pipelines/schemas";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/shell/page-header";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function getPipelineStages(
  supabase: SupabaseServerClient,
): Promise<PipelineStageRow[]> {
  const { data, error } = await supabase
    .from("pipeline_stages")
    .select("id, code, label, desc, color, created_at, updated_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export default async function AdminPipelinesPage() {
  const { user, access } = await getRequestAuth();

  if (!user) {
    redirect("/login?next=/admin/pipelines");
  }

  if (!access?.isHr) {
    redirect("/admin/jd");
  }

  const supabase = await createClient();
  const stagesPromise = getPipelineStages(supabase);

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
