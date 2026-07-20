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
import { listChapters } from "@/lib/db/chapters";
import { getPool } from "@/lib/db/config/client";
import { PageHeader } from "@/components/admin/shell/page-header";

async function getChapters(): Promise<ChapterRow[]> {
  const chapters = await listChapters(getPool());
  return chapters.map((c) => ({ id: c.id, name: c.name }));
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

  const chaptersPromise = getChapters();

  return (
    <div className="flex flex-col gap-4 font-sans">
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
