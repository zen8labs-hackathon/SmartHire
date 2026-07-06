import { Card } from "@heroui/react";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 animate-pulse">
      <div>
        <div className="h-7 w-72 max-w-full rounded bg-default-200" />
        <div className="mt-2 h-4 w-56 rounded bg-default-100" />
      </div>

      <Card>
        <Card.Header>
          <div className="h-5 w-40 rounded bg-default-200" />
          <div className="mt-1.5 h-4 w-64 max-w-full rounded bg-default-100" />
        </Card.Header>
        <Card.Content className="flex flex-col gap-3 p-6">
          <div className="h-4 w-full rounded bg-default-100" />
          <div className="h-4 w-11/12 rounded bg-default-100" />
          <div className="h-4 w-full rounded bg-default-100" />
          <div className="h-4 w-3/4 rounded bg-default-100" />
        </Card.Content>
      </Card>

      <Card>
        <Card.Header>
          <div className="h-5 w-32 rounded bg-default-200" />
        </Card.Header>
        <Card.Content className="flex flex-col gap-3 p-6">
          <div className="h-4 w-full rounded bg-default-100" />
          <div className="h-4 w-5/6 rounded bg-default-100" />
          <div className="h-4 w-2/3 rounded bg-default-100" />
        </Card.Content>
      </Card>
    </div>
  );
}
