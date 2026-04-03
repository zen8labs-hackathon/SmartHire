import { LoginForm } from "@/components/auth/login-form";
import { Alert, Card } from "@heroui/react";

type Props = {
  searchParams: Promise<{ next?: string; reason?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { next, reason } = await searchParams;
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
          {reason === "no-signup" ? (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Self-service sign-up is disabled</Alert.Title>
                <Alert.Description>
                  Ask an administrator to create your account. You can sign in
                  once you have credentials.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}
          <LoginForm nextPath={nextPath} />
          <p className="text-center text-sm text-muted">
            New users are added by an admin — use the credentials you were given.
          </p>
        </Card.Content>
      </Card>
    </div>
  );
}
