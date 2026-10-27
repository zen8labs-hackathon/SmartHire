import { z } from "zod";

import { withTransaction } from "@/lib/db/config/client";
import { applyJobConversion } from "@/lib/migration/convert-job";
import {
  conversionBodySchema,
  conversionErrorResponse,
  guardMigrationRequest,
  type RouteContext,
} from "@/lib/migration/convert-job-route";

const applyBodySchema = conversionBodySchema
  .extend({ fingerprint: z.string().min(1).max(200) })
  .strict();

/** Converts exactly one legacy job. One-way: there is no rollback. */
export async function POST(request: Request, ctx: RouteContext) {
  const g = await guardMigrationRequest(request, ctx, applyBodySchema);
  if (!g.ok) return g.response;
  const { jobId, userId, body } = g.value;
  const { fingerprint, ...input } = body;
  try {
    const result = await withTransaction((tx) =>
      applyJobConversion(tx, { jobId, ...input }, fingerprint, userId),
    );
    return Response.json(result);
  } catch (e) {
    return conversionErrorResponse(e);
  }
}
