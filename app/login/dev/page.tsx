import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { safeNextPath } from "@/lib/auth/next-path";
import { Card } from "@heroui/react";

/**
 * Hidden email/password login for local dev and the develop stack. The public
 * `/login` only offers Microsoft SSO; this route keeps the password path (the
 * `signIn` server action + seeded `admin@smart-hire.test`) reachable without
 * exposing it in the main UI.
 *
 * Resolves the same way `lib/logger.ts` does: `APP_ENV`, falling back to
 * `NODE_ENV`. Real production sets `APP_ENV=production` (docker-compose.prod.yml)
 * so this 404s there; `DEV_LOGIN_ENABLED=true` forces it on regardless.
 */

const devLoginEnabled = process.env.APP_ENV === "development";

export const metadata: Metadata = {
  title: "Dev sign-in — Smart Hire",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ next?: string }>;
};

export default async function DevLoginPage({ searchParams }: Props) {
  if (!devLoginEnabled) notFound();

  const { next } = await searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : "/dashboard");

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-brand-green-dark bg-grid-pattern p-6">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-brand-gold/15 blur-[120px] animate-pulse-glow" />

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center">
            <img src="/logo.svg" alt="SmartHire Logo" className="h-14 w-14" />
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-white">
            Dev sign-in
          </h1>
          <p className="mt-2 text-sm text-white/65">
            Email &amp; password login for development only
          </p>
        </div>

        <Card className="glass-panel w-full border border-divider shadow-2xl rounded-2xl p-6">
          <Card.Content className="flex flex-col gap-4 p-0">
            <LoginForm nextPath={nextPath} />
          </Card.Content>
        </Card>

        <p className="mt-8 text-center text-xs text-white/55 leading-relaxed">
          This page is hidden and not indexed. Production uses Microsoft SSO at{" "}
          <span className="font-medium">/login</span>.
        </p>
      </div>
    </div>
  );
}
