import { getPool } from "@/lib/db/config/client";
import { dryRunJobConversion } from "@/lib/migration/convert-job";
import {
  conversionBodySchema,
  conversionErrorResponse,
  guardMigrationRequest,
  type RouteContext,
} from "@/lib/migration/convert-job-route";

/** Read-only preview of converting one legacy job. Returns the plan, blockers and a fingerprint to confirm. */
export async function POST(request: Request, ctx: RouteContext) {
  const g = await guardMigrationRequest(request, ctx, conversionBodySchema);
  if (!g.ok) return g.response;
  const { jobId, body } = g.value;
  try {
    const plan = await dryRunJobConversion(getPool(), { jobId, ...body });
    return Response.json({ plan });
  } catch (e) {
    return conversionErrorResponse(e);
  }
}
