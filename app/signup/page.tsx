import Link from "next/link";

import { SignUpForm } from "@/components/auth/signup-form";
import { Card } from "@heroui/react";

export default function SignUpPage() {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <Card.Header>
          <Card.Title>Create account</Card.Title>
          <Card.Description>
            Create an account with your email and a password.
          </Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          <SignUpForm />
          <p className="text-center text-sm text-muted">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-accent underline">
              Sign in
            </Link>
          </p>
        </Card.Content>
      </Card>
    </div>
  );
}
