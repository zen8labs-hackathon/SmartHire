import { Card } from "@heroui/react";

const LOADING_ROW_IDS = [
  "pipeline-stages-loading-1",
  "pipeline-stages-loading-2",
  "pipeline-stages-loading-3",
];

/**
 * Suspense fallback for just the Stages panel's `Card.Content` on
 * `/admin/pipelines` (i.e. the part of `StagesPanel` gated on
 * `use(stagesPromise)`). Mirrors the row skeleton in
 * `app/admin/pipelines/loading.tsx`, which remains the route-level fallback
 * shown before any HTML streams.
 */
export function StagesPanelSkeleton() {
  return (
    <Card.Content className="p-6 animate-pulse">
      <div className="flex flex-col gap-3">
        {LOADING_ROW_IDS.map((id) => (
          <div
            key={id}
            className="flex items-center justify-between gap-3 rounded-xl border border-divider px-3 py-2"
          >
            <div className="h-4 w-32 rounded bg-default-200" />
            <div className="h-4 w-16 rounded bg-default-100" />
          </div>
        ))}
      </div>
    </Card.Content>
  );
}
