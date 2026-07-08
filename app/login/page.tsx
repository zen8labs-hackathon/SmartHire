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
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background bg-grid-pattern p-6">
      {/* Radiant Spotlight Background Effect */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-accent/10 blur-[120px] animate-pulse-glow" />

      <div className="relative z-10 w-full max-w-[420px]">
        {/* Logo and Header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-accent to-indigo-400 shadow-lg shadow-accent/15 transition-transform duration-300 hover:scale-105">
            <svg
              className="h-6 w-6 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
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
            {reason === "no-signup" ? (
              <Alert status="warning" className="rounded-xl border border-warning/10 bg-warning/5 text-warning p-3">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title className="text-xs font-semibold">Sign-up is invite-only</Alert.Title>
                  <Alert.Description className="text-xs text-warning opacity-90 mt-1 leading-normal">
                    Contact your HR administrator to request an account. Once set up, log in with your credentials.
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}

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
