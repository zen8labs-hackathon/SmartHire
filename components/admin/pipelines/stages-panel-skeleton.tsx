const LOADING_ROW_IDS = [
  "pipeline-stages-loading-1",
  "pipeline-stages-loading-2",
  "pipeline-stages-loading-3",
];

export function StagesPanelSkeleton() {
  return (
    <div className="p-6 animate-pulse">
      <div className="flex flex-col gap-3">
        {LOADING_ROW_IDS.map((id) => (
          <div
            key={id}
            className="flex items-center justify-between gap-3 rounded-xl border border-divider bg-surface-secondary/20 px-4 py-3"
          >
            <div className="h-4 w-32 rounded bg-default-200" />
            <div className="h-6 w-14 rounded bg-default-100 border border-divider" />
          </div>
        ))}
      </div>
    </div>
  );
}
