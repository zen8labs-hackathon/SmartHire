import { Card } from "@heroui/react";

const LOADING_ROW_IDS = ["chapters-loading-1", "chapters-loading-2", "chapters-loading-3"];

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <Card className="animate-pulse">
        <Card.Header>
          <div className="h-5 w-24 rounded bg-default-200" />
          <div className="mt-1.5 h-4 w-64 max-w-full rounded bg-default-100" />
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
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
      </Card>
    </div>
  );
}
