import { Card } from "@heroui/react";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 animate-pulse">
      <div>
        <div className="h-7 w-56 rounded bg-default-200" />
        <div className="mt-2 h-4 w-full max-w-xl rounded bg-default-100" />
      </div>

      <Card>
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
    </div>
  );
}
