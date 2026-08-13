import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { DevTestShell } from "@/components/admin/dev-test/dev-test-shell";
import { PageHeader } from "@/components/admin/shell/page-header";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { isDevEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "Dev Test | Smart Hire Admin",
  description: "One-off dev-only test tools -- currently: send a real test email.",
};

/**
 * Dev-only, general-purpose home for ad hoc test tools (see
 * components/admin/dev-test/dev-test-shell.tsx for how a new one gets
 * added as another tab). Redirects away in two cases, same as
 * app/login/dev/page.tsx's own gate: no staff access, or APP_ENV isn't
 * "development". The API routes any panel here calls (e.g.
 * app/api/admin/email/{oauth/microsoft,dev-test}/*) enforce the same
 * isDevEnv() check independently -- this redirect is a UX nicety, not the
 * security boundary.
 */
export default async function DevTestPage() {
  const { user, access } = await getRequestAuth();
  if (!isDevEnv() || !access?.isHr) redirect("/dashboard");
  if (!user) redirect("/login?next=/admin/dev-test");

  return (
    <div className="flex flex-col gap-4 font-sans">
      <PageHeader
        title="Dev Test"
        description="One-off dev-only test tools. Currently: send a real test email through either Graph auth mode without touching real candidates."
      />
      <DevTestShell />
    </div>
  );
}
