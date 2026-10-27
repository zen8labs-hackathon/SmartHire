import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { LoginForm } from "@/components/auth/login-form";
import { safeNextPath } from "@/lib/auth/next-path";
import { Card } from "@heroui/react";

/**
 * Hidden email/password login for local dev and the develop stack. The public
 * `/login` only offers Microsoft SSO; this route keeps the password path (the
 * `signIn` server action + seeded `admin@smart-hire.test`) reachable without
 * exposing it in the main UI.
 *
 * Compose sets APP_ENV to `development` or `production`. Local `next dev`
 * leaves it unset, so fall back to NODE_ENV. Read it per request:
 * `.env` is dockerignored, and a module-scope read during `next build`
 * bakes a 404 into the image. `connection()` skips that prerender.
 */
function isDevLoginEnabled(): boolean {
  const appEnv =
    process.env.APP_ENV ??
    (process.env.NODE_ENV === "production" ? "production" : "development");
  return appEnv === "development";
}

export const metadata: Metadata = {
  title: "Dev sign-in — Smart Hire",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ next?: string }>;
};

export default async function DevLoginPage({ searchParams }: Props) {
  await connection();
  if (!isDevLoginEnabled()) notFound();

  const { next } = await searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : "/dashboard");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-subtle p-6">

      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center">
            <img src="/logo.svg" alt="SmartHire Logo" className="h-12 w-12" />
          </div>
          <h1 className="mt-4 text-page font-semibold text-heading">
            Dev sign-in
          </h1>
          <p className="mt-1 text-body text-muted">
            Email &amp; password login for development only
          </p>
        </div>

        <Card className="w-full rounded-lg border border-divider bg-surface p-6 shadow-none">
          <Card.Content className="flex flex-col gap-4 p-0">
            <LoginForm nextPath={nextPath} />
          </Card.Content>
        </Card>

        <p className="mt-6 text-center text-caption leading-relaxed text-muted">
          This page is hidden and not indexed. Production uses Microsoft SSO at{" "}
          <span className="font-medium">/login</span>.
        </p>
      </div>
    </div>
  );
}
