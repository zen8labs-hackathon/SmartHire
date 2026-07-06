import { Card } from "@heroui/react";

const LOADING_ROW_IDS = ["chapters-loading-1", "chapters-loading-2", "chapters-loading-3"];

/**
 * Suspense fallback for just the add-form + list region of `/admin/chapters`
 * (i.e. the part of `ChaptersSetup` gated on `use(chaptersPromise)`). Mirrors
 * the `Card.Content` skeleton in `app/admin/chapters/loading.tsx`, which
 * remains the route-level fallback shown before any HTML streams.
 */
export function ChaptersListSkeleton() {
  return (
    <Card.Content className="flex flex-col gap-4 animate-pulse">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="h-10 min-w-0 flex-1 rounded-xl bg-default-100" />
        <div className="h-10 w-20 shrink-0 rounded-xl bg-default-200" />
      </div>

      <div>
        <div className="h-3 w-16 rounded bg-default-100" />
        <ul className="mt-2 flex list-none flex-col gap-2">
          {LOADING_ROW_IDS.map((id) => (
            <li
              key={id}
              className="flex items-center justify-between gap-3 rounded-xl border border-divider px-3 py-2"
            >
              <div className="h-4 w-32 rounded bg-default-200" />
              <div className="h-4 w-12 rounded bg-default-100" />
            </li>
          ))}
        </ul>
      </div>
    </Card.Content>
  );
}
