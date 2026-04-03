import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { Card } from "@heroui/react";

type Props = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;
  const nextPath =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/dashboard";

  return (
    <div className="flex min-h-full flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <Card.Header>
          <Card.Title>Sign in</Card.Title>
          <Card.Description>
            Sign in with the email and password for your account.
          </Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          <LoginForm nextPath={nextPath} />
          <p className="text-center text-sm text-muted">
            No account?{" "}
            <Link href="/signup" className="font-medium text-accent underline">
              Sign up
            </Link>
          </p>
        </Card.Content>
      </Card>
    </div>
  );
}
