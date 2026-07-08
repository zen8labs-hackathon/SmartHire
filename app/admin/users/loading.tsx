import { Card } from "@heroui/react";

export default function UsersLoading() {
  return (
    <div className="flex flex-col gap-8 font-sans">
      <div className="animate-pulse">
        <div className="h-7 w-40 rounded bg-default-200" />
        <div className="mt-2 h-4 w-96 max-w-full rounded bg-default-100" />
      </div>

      <Card variant="secondary" className="border-divider animate-pulse">
        <Card.Header className="border-b border-divider px-5 py-4">
          <div className="h-5 w-32 rounded bg-default-200" />
          <div className="mt-1.5 h-4 w-48 rounded bg-default-100" />
        </Card.Header>
        <Card.Content className="flex flex-col gap-3 p-6">
          <div className="h-4 w-full rounded bg-default-100" />
          <div className="h-4 w-11/12 rounded bg-default-100" />
          <div className="h-4 w-3/4 rounded bg-default-100" />
        </Card.Content>
      </Card>
    </div>
  );
}
