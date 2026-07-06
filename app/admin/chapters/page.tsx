import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chapters | Smart Hire Admin",
  description: "Define recruiting chapters and viewer access.",
};

import { Alert } from "@heroui/react";

import { ChaptersListSkeleton } from "@/components/admin/chapters-list-skeleton";
import { ChaptersSetup, type ChapterRow } from "@/components/admin/chapters-setup";
import { SuspenseErrorBoundary } from "@/components/admin/suspense-error-boundary";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/shell/page-header";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function getChapters(supabase: SupabaseServerClient): Promise<ChapterRow[]> {
  const { data, error } = await supabase
    .from("chapters")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

function ChaptersErrorFallback() {
  return (
    <div className="p-4">
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Error</Alert.Title>
          <Alert.Description>Could not load chapters. Please refresh.</Alert.Description>
        </Alert.Content>
      </Alert>
    </div>
  );
}

export default async function AdminChaptersPage() {
  const { user, access } = await getRequestAuth();
  if (!user) redirect("/login?next=/admin/chapters");
  if (!access?.isHr) redirect("/admin/jd");

  const supabase = await createClient();
  const chaptersPromise = getChapters(supabase);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 font-sans">
      <PageHeader
        title="Chapters & Departments"
        description="Define recruiting chapters to organize roles, users, and viewer permissions."
      />

      <SuspenseErrorBoundary fallback={<ChaptersErrorFallback />}>
        <Suspense fallback={<ChaptersListSkeleton />}>
          <ChaptersSetup chaptersPromise={chaptersPromise} />
        </Suspense>
      </SuspenseErrorBoundary>
    </div>
  );
}
