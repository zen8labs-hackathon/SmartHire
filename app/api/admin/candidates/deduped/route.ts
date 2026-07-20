import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { queryDedupedCandidatesList } from "@/lib/candidates/candidates-dedup";
import { getPool } from "@/lib/db/config/client";

function parsePositiveInt(raw: string | null): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return undefined;
  return n;
}

function parseDateParam(raw: string | null): string | undefined {
  if (raw == null || raw === "") return undefined;
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return s;
}

export async function GET(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const result = await queryDedupedCandidatesList(getPool(), {
    limit: parsePositiveInt(url.searchParams.get("limit")) ?? 50,
    offset: parsePositiveInt(url.searchParams.get("offset")) ?? 0,
    q: url.searchParams.get("q")?.trim() || undefined,
    uploadFrom: parseDateParam(url.searchParams.get("uploadFrom")),
    uploadTo: parseDateParam(url.searchParams.get("uploadTo")),
  });

  if (result.error) {
    return Response.json({ error: result.error }, { status: 500 });
  }

  return Response.json({ candidates: result.people, pagination: result.pagination });
}
