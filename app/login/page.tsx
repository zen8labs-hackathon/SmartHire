import { LoginForm } from "@/components/auth/login-form";
import { MicrosoftSignInButton } from "@/components/auth/microsoft-signin-button";
import { Alert, Card } from "@heroui/react";

type Props = {
  searchParams: Promise<{ next?: string; reason?: string }>;
};

const REASON_MESSAGES: Record<string, { title: string; description: string }> = {
  "no-signup": {
    title: "Sign-up is invite-only",
    description:
      "Contact your HR administrator to request an account. Once set up, log in with your credentials.",
  },
  "sso-cancelled": {
    title: "Microsoft sign-in was cancelled",
    description: "You can try again, or sign in with your email and password instead.",
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
      "This Microsoft account isn't linked to a SmartHire user. Contact your HR administrator.",
  },
  "sso-failed": {
    title: "Microsoft sign-in failed",
    description: "Something went wrong. Please try again or use your email and password.",
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
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background bg-grid-pattern p-6">
      {/* Radiant Spotlight Background Effect */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-accent/10 blur-[120px] animate-pulse-glow" />

      <div className="relative z-10 w-full max-w-[420px]">
        {/* Logo and Header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center transition-transform duration-300 hover:scale-105">
            <img src="/logo.svg" alt="SmartHire Logo" className="h-14 w-14" />
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-muted">
            Sign in to manage your recruitment pipeline
          </p>
        </div>

        {/* Login Card */}
        <Card className="glass-panel w-full border border-divider shadow-2xl rounded-2xl p-6">
          <Card.Content className="flex flex-col gap-5 p-0">
            {reasonMessage ? (
              <Alert status="warning" className="rounded-xl border border-warning/10 bg-warning/5 text-warning p-3">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title className="text-xs font-semibold">{reasonMessage.title}</Alert.Title>
                  <Alert.Description className="text-xs text-warning opacity-90 mt-1 leading-normal">
                    {reasonMessage.description}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}

            <MicrosoftSignInButton next={nextPath} />

            <div className="flex items-center gap-3 text-xs text-muted">
              <div className="h-px flex-1 bg-divider" />
              <span>or</span>
              <div className="h-px flex-1 bg-divider" />
            </div>

            <LoginForm nextPath={nextPath} />
          </Card.Content>
        </Card>

        {/* Footer info */}
        <p className="mt-8 text-center text-xs text-muted leading-relaxed">
          Smart Hire is used internally by authorized HR teams.<br />
          Protected by role-based workspace security.
        </p>
      </div>
    </div>
  );
}
