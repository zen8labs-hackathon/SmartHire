import { LoginForm } from "@/components/auth/login-form";
import { MicrosoftSignInButton } from "@/components/auth/microsoft-signin-button";
import { Alert, Card } from "@heroui/react";

type Props = {
  searchParams: Promise<{ next?: string; reason?: string }>;
};

const REASON_MESSAGES: Record<string, { title: string; description: string }> =
  {
    "no-signup": {
      title: "Sign-up is invite-only",
      description:
        "Contact your HR administrator to request an account. Once set up, log in with your credentials.",
    },
    "sso-cancelled": {
      title: "Microsoft sign-in was cancelled",
      description:
        "You can try again, or sign in with your email and password instead.",
    },
    "sso-expired": {
      title: "Sign-in request expired",
      description: "The Microsoft sign-in link timed out. Please try again.",
    },
    "sso-invalid-state": {
      title: "Sign-in request could not be verified",
      description: "Please try signing in with Microsoft again.",
    },
    "sso-not-invited": {
      title: "Account not linked",
      description:
        "This email is already registered with a different sign-in method. Contact your HR administrator.",
    },
    "sso-failed": {
      title: "Microsoft sign-in failed",
      description:
        "Something went wrong. Please try again.",
    },
  };

export default async function LoginPage({ searchParams }: Props) {
  const { next, reason } = await searchParams;
  const nextPath =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/dashboard";
  const reasonMessage = reason ? REASON_MESSAGES[reason] : undefined;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-subtle p-6">

      <div className="w-full max-w-[400px]">
        {/* Logo and Header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center">
            <img src="/logo.svg" alt="SmartHire Logo" className="h-12 w-12" />
          </div>
          <h1 className="mt-4 text-page font-semibold text-heading">
            Welcome back
          </h1>
          <p className="mt-1 text-body text-muted">
            Sign in to manage your recruitment pipeline
          </p>
        </div>

        {/* Login Card */}
        <Card className="w-full rounded-lg border border-divider bg-surface p-6 shadow-none">
          <Card.Content className="flex flex-col gap-4 p-0">
            {reasonMessage ? (
              <Alert
                status="warning"
                className="rounded-md border border-warning/30 bg-warning-soft p-3 text-warning"
              >
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title className="text-caption font-semibold">
                    {reasonMessage.title}
                  </Alert.Title>
                  <Alert.Description className="mt-1 text-caption leading-normal text-fg-2">
                    {reasonMessage.description}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}

            <p className="text-center text-caption text-muted">
              Continue with your organization&apos;s Microsoft account
            </p>

            <MicrosoftSignInButton next={nextPath} />
          </Card.Content>
        </Card>

        {/* Footer info */}
        <p className="mt-6 text-center text-caption leading-relaxed text-muted">
          Smart Hire is used internally by authorized HR teams.
          <br />
          Protected by role-based workspace security.
        </p>
      </div>
    </div>
  );
}
