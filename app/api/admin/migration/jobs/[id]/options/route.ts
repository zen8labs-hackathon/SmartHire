import { getPool } from "@/lib/db/config/client";
import { guardMigrationRequest, type RouteContext } from "@/lib/migration/convert-job-route";
import { getMigrationOptions } from "@/lib/migration/migration-queries";

/** Wizard data for ONE job: its old stage mappings and the live pipelines it can move to. */
export async function GET(request: Request, ctx: RouteContext) {
  const g = await guardMigrationRequest(request, ctx);
  if (!g.ok) return g.response;
  const options = await getMigrationOptions(getPool(), g.value.jobId);
  if (!options) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json(options);
}
