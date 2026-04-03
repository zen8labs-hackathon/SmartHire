import Link from "next/link";

import { AddUserForm } from "@/components/admin/add-user-form";
import { Card } from "@heroui/react";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <Card>
        <Card.Header>
          <Card.Title>Admin</Card.Title>
          <Card.Description>
            Create a user with email and password. They can sign in immediately
            (email is marked confirmed).
          </Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          <AddUserForm />
          <p className="text-center text-sm text-muted">
            <Link href="/dashboard" className="font-medium text-accent underline">
              Back to dashboard
            </Link>
          </p>
        </Card.Content>
      </Card>
    </div>
  );
}
