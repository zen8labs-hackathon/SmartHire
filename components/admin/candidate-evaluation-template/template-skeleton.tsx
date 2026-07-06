import { Card } from "@heroui/react";

/**
 * Suspense fallback for just the "Template file" Card on
 * `/admin/evaluation-template` (i.e. the part of
 * `CandidateEvaluationTemplateManager` gated on `use(templateInfoPromise)`).
 * Mirrors the Card skeleton in `app/admin/evaluation-template/loading.tsx`,
 * which remains the route-level fallback shown before any HTML streams; the
 * page title/description render outside this boundary and don't need a
 * skeleton.
 */
export function TemplateSkeleton() {
  return (
    <Card className="animate-pulse">
      <Card.Header>
        <div className="h-5 w-32 rounded bg-default-200" />
        <div className="mt-1.5 h-4 w-64 max-w-full rounded bg-default-100" />
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-xl border border-divider bg-surface-secondary px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="h-4 w-48 rounded bg-default-200" />
            <div className="mt-2 h-3 w-32 rounded bg-default-100" />
          </div>
          <div className="h-9 w-24 shrink-0 rounded-xl bg-default-100" />
        </div>

        <div className="h-24 w-full rounded-xl border border-dashed border-divider bg-default-100/60" />
      </Card.Content>
    </Card>
  );
}
