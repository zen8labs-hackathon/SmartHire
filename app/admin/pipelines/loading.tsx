const LOADING_ROW_IDS = ["pipelines-loading-1", "pipelines-loading-2", "pipelines-loading-3"];

function PipelineRowsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
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
  );
}

export default function Loading() {
  return (
    <div className="flex flex-col gap-6 font-sans animate-pulse">
      <div>
        <div className="h-7 w-48 rounded bg-default-200" />
        <div className="mt-2 h-4 w-96 max-w-full rounded bg-default-100" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-divider bg-surface-primary p-6 shadow-sm min-h-[500px]">
          <div className="flex items-center justify-between border-b border-divider pb-4 mb-4">
            <div>
              <div className="h-5 w-32 rounded bg-default-200" />
              <div className="mt-2 h-4 w-40 rounded bg-default-100" />
            </div>
            <div className="h-9 w-20 rounded-xl bg-default-200" />
          </div>
          <PipelineRowsSkeleton />
        </div>

        <div className="rounded-2xl border border-divider bg-surface-primary p-6 shadow-sm min-h-[500px]">
          <div className="flex items-center justify-between border-b border-divider pb-4 mb-4">
            <div>
              <div className="h-5 w-36 rounded bg-default-200" />
              <div className="mt-2 h-4 w-48 rounded bg-default-100" />
            </div>
          </div>
          <PipelineRowsSkeleton />
        </div>
      </div>
    </div>
  );
}
