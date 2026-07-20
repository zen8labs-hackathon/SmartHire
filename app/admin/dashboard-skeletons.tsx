export function StatsGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="relative overflow-hidden border border-divider/60 bg-surface-secondary/35 p-5 rounded-2xl animate-pulse"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="h-3 w-28 rounded bg-default-200" />
            <div className="h-5 w-5 rounded bg-default-200" />
          </div>
          <div className="mt-3 h-8 w-20 rounded bg-default-200" />
          <div className="mt-2 h-3 w-36 rounded bg-default-100" />
        </div>
      ))}
    </div>
  );
}

export function SectionListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-divider">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-3 animate-pulse">
          <div className="space-y-1.5">
            <div className="h-4 w-40 rounded bg-default-200" />
            <div className="h-3 w-24 rounded bg-default-100" />
          </div>
          <div className="h-5 w-16 rounded-full bg-default-100" />
        </div>
      ))}
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <div className="relative border-l-2 border-divider pl-4 ml-2 space-y-5 py-1 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="relative">
          <span className="absolute -left-[21px] top-1.5 flex h-2 w-2 rounded-full bg-default-200" />
          <div className="flex items-center justify-between gap-4">
            <div className="h-4 w-64 rounded bg-default-200" />
            <div className="h-3 w-24 rounded bg-default-100 shrink-0" />
          </div>
        </div>
      ))}
    </div>
  );
}
