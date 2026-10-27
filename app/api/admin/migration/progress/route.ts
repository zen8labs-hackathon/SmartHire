import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { getPool } from "@/lib/db/config/client";
import { listMigrationProgress } from "@/lib/migration/migration-queries";

/** Read-only progress of the legacy -> new flow conversion, one row per position. */
export async function GET(request: Request) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;
  return Response.json({ jobs: await listMigrationProgress(getPool()) });
}
