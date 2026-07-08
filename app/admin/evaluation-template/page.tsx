import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Evaluation Template | Smart Hire Admin",
  description: "Upload and manage organization-wide interview templates.",
};

import { Alert } from "@heroui/react";

import {
  CandidateEvaluationTemplateManager,
  type TemplateInfo,
} from "@/components/admin/candidate-evaluation-template/candidate-evaluation-template-manager";
import { TemplateSkeleton } from "@/components/admin/candidate-evaluation-template/template-skeleton";
import { SuspenseErrorBoundary } from "@/components/admin/suspense-error-boundary";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/shell/page-header";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function getTemplateInfo(
  supabase: SupabaseServerClient,
): Promise<TemplateInfo> {
  const { data, error } = await supabase
    .from("candidate_evaluation_template")
    .select("storage_path, original_filename, mime_type, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;

  const row = data as {
    storage_path: string | null;
    original_filename: string | null;
    mime_type: string | null;
    updated_at: string;
  } | null;

  return {
    hasFile: Boolean(row?.storage_path),
    originalFilename: row?.original_filename ?? null,
    mimeType: row?.mime_type ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

function TemplateErrorFallback() {
  return (
    <div className="p-4">
      <Alert status="danger" className="rounded-xl">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Error</Alert.Title>
          <Alert.Description>
            Could not load the template status. Please refresh.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    </div>
  );
}

export default async function AdminEvaluationTemplatePage() {
  const { user, access } = await getRequestAuth();
  if (!user) redirect("/login?next=/admin/evaluation-template");
  if (!access?.isHr) redirect("/admin/jd");

  const supabase = await createClient();
  const templateInfoPromise = getTemplateInfo(supabase);

  return (
    <div className="flex flex-col gap-4 font-sans">
      <PageHeader
        title="Evaluation Template"
        description="Upload and manage the PDF document used as the organisation-wide candidate interview evaluation form."
      />

      <SuspenseErrorBoundary fallback={<TemplateErrorFallback />}>
        <Suspense fallback={<TemplateSkeleton />}>
          <CandidateEvaluationTemplateManager
            templateInfoPromise={templateInfoPromise}
          />
        </Suspense>
      </SuspenseErrorBoundary>
    </div>
  );
}
