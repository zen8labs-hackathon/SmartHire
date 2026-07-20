import { PageHeader } from "@/components/admin/shell/page-header";
import { SectionCard } from "@/components/admin/shell/cards";
import { StagesPanelSkeleton } from "@/components/admin/pipelines/stages-panel-skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6 font-sans">
      <PageHeader
        title="Pipeline Management"
        description="Configure hiring pipeline stages, sub-stages, status triggers, and evaluation criteria."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          title="Pipeline Stages"
          description="Workflow configuration stages"
          actions={
            <div className="h-8 w-24 animate-pulse rounded-lg bg-default-200" />
          }
        >
          <StagesPanelSkeleton />
        </SectionCard>

        <SectionCard
          title="Sub-stages"
          description="Select a stage to view its sub-stages"
        >
          <div className="flex h-[350px] flex-col items-center justify-center rounded-xl border border-dashed border-divider text-center p-6 bg-surface-secondary/10">
            <p className="text-sm font-semibold text-foreground">
              No Stage Selected
            </p>
            <p className="mt-1.5 text-xs text-muted">
              Select a pipeline stage on the left to view and manage its
              sub-stages.
            </p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
