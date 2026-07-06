import { redirect } from "next/navigation";

import { PipelineManager } from "@/components/admin/pipeline-manager";
import { getStaffProfileAccess } from "@/lib/admin/profile-access";
import type { PipelineStageRow } from "@/lib/pipelines/schemas";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Supabase never rejects a query promise (it resolves with `{ error }`
// populated), so this helper throws explicitly. That gives `use()` a real
// rejection to propagate to the `SuspenseErrorBoundary` inside
// `PipelineManager` instead of the Stages panel silently rendering with an
// empty list.
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/admin/pipelines");
  }

  const access = await getStaffProfileAccess(supabase, user.id, user);
  if (!access?.isHr) {
    redirect("/admin/jd");
  }

  // Kick off the stages query but don't await it here, so the static header
  // below renders immediately. The Suspense boundary inside PipelineManager
  // only gates the Stages panel's Card.Content, which is the part that
  // actually needs the data.
  const stagesPromise = getPipelineStages(supabase);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Pipeline Management
        </h1>
        <p className="mt-1 text-sm text-muted">
          Manage job pipeline stages and their sub-stages configuration.
        </p>
      </div>

      <PipelineManager stagesPromise={stagesPromise} />
    </div>
  );
}
