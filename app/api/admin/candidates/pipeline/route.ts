import { z } from "zod";

import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionOnJob } from "@/lib/authz/require-permission";
import {
  listCampaignAppliedByIds,
  updateCampaignApplied,
} from "@/lib/db/campaign-applied";
import { withTransaction } from "@/lib/db/config/client";
import {
  fetchJobPipelineConfig,
  validateAndBuildPipelineTransition,
} from "@/lib/pipelines/transition-validator";

const updateSchema = z.object({
  id: z.string().uuid(),
  current_job_stage_mapping_id: z.string().uuid(),
  current_sub_state_id: z.string().uuid(),
});

const bodySchema = z.object({
  jobId: z.string().uuid(),
  updates: z.array(updateSchema).min(1).max(100),
});

/**
 * Bulk pipeline-stage transition for a job's applications. All updates
 * commit atomically (`withTransaction`) -- a failure partway through rolls
 * back every update in the batch rather than leaving some candidates
 * transitioned and others not.
 */
export async function POST(request: Request) {
  const auth = await requireStaffForRequest(request);
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
  const { jobId, updates } = parsed.data;

  const manageAccess = await requirePermissionOnJob(
    auth.access,
    "candidate.manage",
    jobId,
  );
  if (!manageAccess.ok) return manageAccess.response;

  try {
    await withTransaction(async (db) => {
      const uniqueIds = [...new Set(updates.map((u) => u.id))];
      const existingRows = await listCampaignAppliedByIds(db, uniqueIds);

      if (existingRows.length !== uniqueIds.length) {
        throw new RouteError("One or more candidates were not found.", 404);
      }

      const byId = new Map(existingRows.map((row) => [row.id, row]));

      for (const row of existingRows) {
        if (row.job_id !== jobId) {
          throw new RouteError(
            "One or more candidates are not assigned to this job.",
            403,
          );
        }
      }

      const { stageMappings, subStages } = await fetchJobPipelineConfig(
        db,
        jobId,
      );
      if (stageMappings.length === 0) {
        throw new RouteError(
          "Could not load pipeline configuration for this job.",
          400,
        );
      }

      for (const u of updates) {
        const prev = byId.get(u.id);
        if (!prev) {
          throw new RouteError("Candidate not found.", 404);
        }

        const result = validateAndBuildPipelineTransition(
          prev,
          {
            toStageMappingId: u.current_job_stage_mapping_id,
            toSubStateId: u.current_sub_state_id,
          },
          stageMappings,
          subStages,
        );
        if (!result.ok) {
          throw new RouteError(result.error, 400);
        }

        const updated = await updateCampaignApplied(db, u.id, {
          currentJobStageMappingId: result.patch.currentJobStageMappingId,
          currentSubStateId: result.patch.currentSubStateId,
          hiredAt: result.patch.hiredAt,
        });
        if (updated) byId.set(u.id, updated);
      }
    });
  } catch (e) {
    if (e instanceof RouteError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Failed to update pipeline.";
    return Response.json({ error: message }, { status: 500 });
  }

  return Response.json({ ok: true, updated: updates.length });
}

class RouteError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
