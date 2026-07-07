import { Suspense } from "react";
import { redirect } from "next/navigation";

import { Alert, Card } from "@heroui/react";

import {
  CandidateEvaluationTemplateManager,
  type TemplateInfo,
} from "@/components/admin/candidate-evaluation-template/candidate-evaluation-template-manager";
import { TemplateSkeleton } from "@/components/admin/candidate-evaluation-template/template-skeleton";
import { SuspenseErrorBoundary } from "@/components/admin/suspense-error-boundary";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Supabase never rejects a query promise (it resolves with `{ error }`
// populated), so this helper throws explicitly. That gives `use()` a real
// rejection to propagate to `SuspenseErrorBoundary` below instead of the
// Card silently rendering with an empty template state. Mirrors the shape
// returned by `GET /api/admin/candidate-evaluation-template`.
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
    <Card>
      <Card.Content>
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Error</Alert.Title>
            <Alert.Description>
              Could not load the template status. Please refresh.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </Card.Content>
    </Card>
  );
}

export default async function AdminEvaluationTemplatePage() {
  const { user, access } = await getRequestAuth();
  if (!user) redirect("/login?next=/admin/evaluation-template");
  if (!access?.isHr) redirect("/admin/jd");

  const supabase = await createClient();

  // Kick off the template-status query but don't await it here, so the
  // static title below renders immediately. The Suspense boundary only gates
  // the "Template file" Card, which is the part that actually needs the data.
  const templateInfoPromise = getTemplateInfo(supabase);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Evaluation template
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Upload a single PDF used as the organisation-wide candidate interview
          evaluation form (for example, an interview evaluation sheet).
        </p>
      </div>

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
