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
