import { z } from "zod";

import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
/* TODO: LEGACY CODE - To be removed when migrating old features */
import { isPipelineTransitionAllowed } from "@/lib/candidates/pipeline-allowed-transitions";
import { buildCandidatePipelinePatch } from "@/lib/candidates/pipeline-transition";
import { zCandidatePipelineStatus } from "@/lib/candidates/pipeline-zod";
import type { CandidateStatus } from "@/lib/candidates/types";
import {
  fetchJobPipelineConfig,
  resolveCandidatePipelineIds,
  isCustomTransitionAllowed,
  buildNewPipelineCandidatePatch,
} from "@/lib/pipelines/transition-validator";

const isoDateTime = z.string().refine(
  (s) => s.length > 0 && Number.isFinite(Date.parse(s)),
  "Invalid ISO datetime",
);

const updateSchema = z.object({
  id: z.string().uuid(),
  /* TODO: LEGACY CODE - To be removed when migrating old features */
  status: zCandidatePipelineStatus.optional(),
  current_job_stage_mapping_id: z.string().uuid().optional(),
  current_sub_state_id: z.string().uuid().optional(),
  interview_at: z.union([isoDateTime, z.null()]).optional(),
  onboarding_at: z.union([isoDateTime, z.null()]).optional(),
});

const bodySchema = z.object({
  jobDescriptionId: z.coerce.number().int().positive(),
  updates: z.array(updateSchema).min(1).max(100),
});

// Helper to format database constraint errors
function formatCandidateStatusConstraintError(message: string): string {
  if (!message.includes("candidates_status_check")) return message;
  return (
    "Database status constraint is outdated. Run migration " +
    "`supabase/migrations/20260506180000_candidate_status_three_phases.sql` " +
    "to allow current pipeline statuses."
  );
}

export async function POST(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }

  const { jobDescriptionId, updates } = parsed.data;

  const { data: openings, error: openingsError } = await auth.supabase
    .from("job_openings")
    .select("id")
    .eq("job_description_id", jobDescriptionId);

  if (openingsError) {
    return Response.json({ error: openingsError.message }, { status: 500 });
  }

  const allowedOpeningIds = new Set(
    (openings ?? []).map((o) => o.id as string).filter(Boolean),
  );
  if (allowedOpeningIds.size === 0) {
    return Response.json(
      { error: "No job opening is linked to this job description." },
      { status: 400 },
    );
  }

  const uniqueIds = [...new Set(updates.map((u) => u.id))];
  const { data: existing, error: loadError } = await auth.supabase
    .from("candidates")
    .select("id, job_opening_id, status, interview_at, onboarding_at, offered_at, current_job_stage_mapping_id, current_sub_state_id, pipeline_status")
    .eq("is_active", true)
    .in("id", uniqueIds);

  if (loadError) {
    return Response.json({ error: loadError.message }, { status: 500 });
  }

  if (!existing || existing.length !== uniqueIds.length) {
    return Response.json(
      { error: "One or more candidates were not found." },
      { status: 404 },
    );
  }

  const byId = new Map(
    existing.map((row) => [
      row.id as string,
      {
        job_opening_id: row.job_opening_id as string | null,
        status: String(row.status),
        interview_at: (row.interview_at as string | null) ?? null,
        onboarding_at: (row.onboarding_at as string | null) ?? null,
        offered_at: (row.offered_at as string | null) ?? null,
        current_job_stage_mapping_id: (row.current_job_stage_mapping_id as string | null) ?? null,
        current_sub_state_id: (row.current_sub_state_id as string | null) ?? null,
        pipeline_status: (row.pipeline_status as string | null) ?? null,
      },
    ]),
  );

  for (const row of existing) {
    const jo = row.job_opening_id as string | null;
    if (!jo || !allowedOpeningIds.has(jo)) {
      return Response.json(
        {
          error:
            "One or more candidates are not assigned to a job opening for this job description.",
        },
        { status: 403 },
      );
    }
  }

  const pipelineConfigCache = new Map<string, { stageMappings: any[]; subStages: any[] }>();

  for (const u of updates) {
    const prev = byId.get(u.id);
    if (!prev) {
      return Response.json({ error: "Candidate not found." }, { status: 404 });
    }

    const isNewPipelineUpdate = !!(u.current_job_stage_mapping_id && u.current_sub_state_id);
    let patch: Record<string, any>;

    if (isNewPipelineUpdate) {
      const jo = prev.job_opening_id;
      if (!jo) {
        return Response.json(
          { error: "Candidate is not linked to any job opening." },
          { status: 400 }
        );
      }

      let config = pipelineConfigCache.get(jo);
      if (!config) {
        const { stageMappings, subStages, error: configError } = await fetchJobPipelineConfig(
          auth.supabase,
          jo
        );
        if (configError || stageMappings.length === 0) {
          return Response.json(
            { error: `Could not load pipeline configuration: ${configError ?? "No stages"}` },
            { status: 400 }
          );
        }
        config = { stageMappings, subStages };
        pipelineConfigCache.set(jo, config);
      }

      // Resolve candidate's from-state IDs (falls back to legacy status if null)
      const { stageMappingId: fromStageMappingId, subStateId: fromSubStateId } = resolveCandidatePipelineIds(
        prev,
        config.stageMappings,
        config.subStages
      );

      if (!fromStageMappingId || !fromSubStateId) {
        return Response.json(
          { error: "Could not resolve candidate's current stage." },
          { status: 400 }
        );
      }

      // Validate transition rules
      const allowed = isCustomTransitionAllowed(
        config.stageMappings,
        config.subStages,
        fromStageMappingId,
        fromSubStateId,
        u.current_job_stage_mapping_id!,
        u.current_sub_state_id!
      );

      if (!allowed) {
        return Response.json(
          { error: "Invalid status transition for this job's custom pipeline." },
          { status: 400 }
        );
      }

      // Construct update patch
      try {
        patch = buildNewPipelineCandidatePatch(
          prev,
          {
            toStageMappingId: u.current_job_stage_mapping_id!,
            toSubStateId: u.current_sub_state_id!,
            interview_at: u.interview_at,
            onboarding_at: u.onboarding_at,
          },
          config.stageMappings,
          config.subStages
        );
      } catch (e) {
        return Response.json(
          { error: e instanceof Error ? e.message : "Error building patch." },
          { status: 400 }
        );
      }
    } else {
      /* TODO: LEGACY CODE - To be removed when migrating old features */
      // Legacy transition updates
      const targetStatus = u.status ?? prev.status;
      if (!isPipelineTransitionAllowed(prev.status, targetStatus)) {
        return Response.json(
          {
            error: `Invalid status transition: ${prev.status} → ${targetStatus}.`,
          },
          { status: 400 },
        );
      }

      patch = buildCandidatePipelinePatch(
        {
          status: prev.status,
          interview_at: prev.interview_at,
          onboarding_at: prev.onboarding_at,
        },
        {
          ...u,
          status: targetStatus as CandidateStatus,
        },
      );
    }

    const { error: upErr } = await auth.supabase
      .from("candidates")
      .update(patch)
      .eq("id", u.id);

    if (upErr) {
      return Response.json(
        { error: formatCandidateStatusConstraintError(upErr.message) },
        { status: 500 },
      );
    }

    byId.set(u.id, {
      ...prev,
      ...patch,
    });
  }

  return Response.json({ ok: true, updated: updates.length });
}
