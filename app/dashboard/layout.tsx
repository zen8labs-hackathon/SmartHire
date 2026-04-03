import Link from "next/link";
import { redirect } from "next/navigation";

import { SignOutForm } from "@/components/auth/sign-out-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-divider bg-surface-secondary px-6 py-3">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-foreground">Smart Hire</span>
          <Link
            href="/"
            className="text-sm text-muted hover:text-foreground hover:underline"
          >
            Home
          </Link>
        </div>
        <SignOutForm />
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
