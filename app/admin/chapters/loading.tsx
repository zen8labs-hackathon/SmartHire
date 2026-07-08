export default function Loading() {
  return (
    <div className="flex flex-col gap-4 font-sans animate-pulse">
      <div>
        <div className="h-7 w-48 rounded bg-default-200" />
        <div className="mt-2 h-4 w-96 max-w-full rounded bg-default-100" />
      </div>

      <div className="rounded-2xl border border-divider bg-surface-primary p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end bg-surface-secondary/20 p-4 rounded-xl border border-divider mb-5">
          <div className="h-9 min-w-0 flex-1 rounded-xl bg-default-100" />
          <div className="h-9 w-24 shrink-0 rounded-xl bg-default-200" />
        </div>
        <div className="space-y-2">
          <div className="h-3.5 w-32 rounded bg-default-200 mb-3" />
          <div className="h-12 w-full rounded-xl bg-default-100 border border-divider" />
          <div className="h-12 w-full rounded-xl bg-default-100 border border-divider" />
          <div className="h-12 w-full rounded-xl bg-default-100 border border-divider" />
        </div>
      </div>
    </div>
  );
}
