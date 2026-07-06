import { Card } from "@heroui/react";

const LOADING_ROW_IDS = ["pipelines-loading-1", "pipelines-loading-2", "pipelines-loading-3"];

function PipelineRowsSkeleton() {
  return (
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
  );
}

export default function Loading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div>
        <div className="h-7 w-48 rounded bg-default-200" />
        <div className="mt-2 h-4 w-96 max-w-full rounded bg-default-100" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="min-h-[500px]">
          <Card.Header className="flex items-center justify-between border-b border-divider px-6 py-4">
            <div>
              <div className="h-5 w-32 rounded bg-default-200" />
              <div className="mt-1.5 h-4 w-40 rounded bg-default-100" />
            </div>
          </Card.Header>
          <Card.Content className="p-6">
            <PipelineRowsSkeleton />
          </Card.Content>
        </Card>

        <Card className="min-h-[500px]">
          <Card.Header className="flex items-center justify-between border-b border-divider px-6 py-4">
            <div>
              <div className="h-5 w-36 rounded bg-default-200" />
              <div className="mt-1.5 h-4 w-48 rounded bg-default-100" />
            </div>
          </Card.Header>
          <Card.Content className="p-6">
            <PipelineRowsSkeleton />
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}
