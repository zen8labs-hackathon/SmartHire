import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { getPool } from "@/lib/db/config/client";
import {
  CANDIDATES2_SORTS,
  listCandidates2,
  type Candidates2Filters,
  type Candidates2Rehire,
  type Candidates2Sort,
} from "@/lib/db/candidates-list2";

const REHIRE: readonly Candidates2Rehire[] = [
  "eligible",
  "ask",
  "not_eligible",
  "unset",
];

function intParam(raw: string | null): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

export async function GET(request: Request) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const sp = new URL(request.url).searchParams;
  const sortBy = sp.get("sortBy") as Candidates2Sort | null;
  const rehire = sp.get("rehire") as Candidates2Rehire | null;
  const apps = sp.get("apps");

  const filters: Candidates2Filters = {
    q: sp.get("q")?.trim() || undefined,
    tab: sp.get("tab") === "applying" ? "applying" : "all",
    role: sp.get("role")?.trim() || undefined,
    tag: sp.get("tag")?.trim() || undefined,
    expMin: intParam(sp.get("expMin")),
    expMax: intParam(sp.get("expMax")),
    rehire: rehire && REHIRE.includes(rehire) ? rehire : undefined,
    apps: apps === "1" || apps === "2+" ? apps : undefined,
    sortBy: sortBy && CANDIDATES2_SORTS.includes(sortBy) ? sortBy : "updated",
    sortDir: sp.get("sortDir") === "asc" ? "asc" : "desc",
    limit: intParam(sp.get("limit")),
    offset: intParam(sp.get("offset")),
  };

  try {
    const r = await listCandidates2(getPool(), filters);
    return Response.json({
      candidates: r.rows,
      counts: r.counts,
      facets: r.facets,
      pagination: {
        limit: r.limit,
        offset: r.offset,
        total: r.total,
        hasMore: r.offset + r.rows.length < r.total,
      },
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load candidates.";
    return Response.json({ error: message }, { status: 500 });
  }
}
