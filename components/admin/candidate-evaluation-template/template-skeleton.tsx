import { SectionCard } from "@/components/admin/shell/cards";

export function TemplateSkeleton() {
  return (
    <SectionCard>
      <div className="flex flex-col gap-4 animate-pulse">
        <div className="flex flex-col gap-3 rounded-xl border border-divider bg-surface-secondary/20 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="h-4 w-48 rounded bg-default-200" />
            <div className="mt-2 h-3.5 w-32 rounded bg-default-100" />
          </div>
          <div className="h-8 w-24 shrink-0 rounded-lg bg-default-100 border border-divider" />
        </div>

        <div className="h-32 w-full rounded-xl border-2 border-dashed border-divider bg-default-100/60" />
      </div>
    </SectionCard>
  );
}
