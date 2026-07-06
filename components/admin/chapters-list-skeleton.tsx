import { SectionCard } from "@/components/admin/shell/cards";

const LOADING_ROW_IDS = ["chapters-loading-1", "chapters-loading-2", "chapters-loading-3"];

export function ChaptersListSkeleton() {
  return (
    <SectionCard title="Manage Chapters" description="List of currently active departments and the creation form.">
      <div className="flex flex-col gap-5 animate-pulse">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end bg-surface-secondary/20 p-4 rounded-xl border border-divider mb-2">
          <div className="h-9 min-w-0 flex-1 rounded-xl bg-default-100" />
          <div className="h-9 w-24 shrink-0 rounded-xl bg-default-200" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-16 rounded bg-default-200 mb-3" />
          {LOADING_ROW_IDS.map((id) => (
            <div
              key={id}
              className="flex items-center justify-between gap-3 rounded-xl border border-divider bg-surface-secondary/20 px-4 py-3"
            >
              <div className="h-4 w-32 rounded bg-default-200" />
              <div className="h-6 w-14 rounded-lg bg-default-100 border border-divider" />
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}
