import { Breadcrumbs } from "@heroui/react";

import { PipelineTableSkeleton } from "@/components/admin/jd/pipeline-table-skeleton";

export default function Loading() {
  return (
    <div className="relative flex flex-col gap-6">
      <header className="space-y-2">
        <Breadcrumbs className="text-xs text-muted">
          <Breadcrumbs.Item href="/admin/jd">Jobs list</Breadcrumbs.Item>
          <Breadcrumbs.Item>
            <span className="inline-block h-3 w-32 animate-pulse rounded bg-default-200 align-middle" />
          </Breadcrumbs.Item>
        </Breadcrumbs>
        <div className="h-8 w-72 max-w-full animate-pulse rounded bg-default-200" />
        <div className="h-4 w-full max-w-2xl animate-pulse rounded bg-default-100" />
      </header>

      <PipelineTableSkeleton />

      <div className="flex justify-center">
        <div className="h-10 w-40 animate-pulse rounded-xl border border-divider bg-surface-secondary" />
      </div>
    </div>
  );
}
