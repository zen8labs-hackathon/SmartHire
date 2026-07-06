import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chapters | Smart Hire Admin",
  description: "Define recruiting chapters and viewer access.",
};

import { Alert, Card } from "@heroui/react";

import { ChaptersListSkeleton } from "@/components/admin/chapters-list-skeleton";
import { ChaptersSetup, type ChapterRow } from "@/components/admin/chapters-setup";
import { SuspenseErrorBoundary } from "@/components/admin/suspense-error-boundary";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Supabase never rejects a query promise (it resolves with `{ error }`
// populated), so this helper throws explicitly. That gives `use()` a real
// rejection to propagate to `SuspenseErrorBoundary` below instead of the
// component silently rendering with `initialChapters` as `[]`.
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
    <Card.Content>
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Error</Alert.Title>
          <Alert.Description>Could not load chapters. Please refresh.</Alert.Description>
        </Alert.Content>
      </Alert>
    </Card.Content>
  );
}

export default async function AdminChaptersPage() {
  const { user, access } = await getRequestAuth();
  if (!user) redirect("/login?next=/admin/chapters");
  if (!access?.isHr) redirect("/admin/jd");

  const supabase = await createClient();

  // Kick off the chapters query but don't await it here, so the static
  // header below renders and streams immediately. The Suspense boundary
  // only gates the part of the tree that actually needs the data.
  const chaptersPromise = getChapters(supabase);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <Card>
        <Card.Header>
          <Card.Title>Chapters</Card.Title>
          <Card.Description>
            Define recruiting chapters. Assign them to users and to job descriptions
            (whole-chapter viewer access).
          </Card.Description>
        </Card.Header>
        <SuspenseErrorBoundary fallback={<ChaptersErrorFallback />}>
          <Suspense fallback={<ChaptersListSkeleton />}>
            <ChaptersSetup chaptersPromise={chaptersPromise} />
          </Suspense>
        </SuspenseErrorBoundary>
      </Card>
    </div>
  );
}
