import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { resolveApplicationStages } from "@/lib/candidates/resolve-application-stage";
import { listCampaignAppliedByCandidate } from "@/lib/db/campaign-applied";
import { getCandidateById } from "@/lib/db/candidates";
import { getPool } from "@/lib/db/config/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ candidateId: string }> };

function parsePositiveInt(raw: string | null): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return undefined;
  return n;
}

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { candidateId } = await params;
  if (!candidateId || !UUID_RE.test(candidateId)) {
    return Response.json({ error: "Invalid candidate ID." }, { status: 400 });
  }

  const url = new URL(request.url);
  const limit = parsePositiveInt(url.searchParams.get("limit"));
  const offset = parsePositiveInt(url.searchParams.get("offset")) ?? 0;

  try {
    const db = getPool();

    const candidate = await getCandidateById(db, candidateId);
    if (!candidate) {
      return Response.json({ error: "Candidate not found" }, { status: 404 });
    }

    const result = await listCampaignAppliedByCandidate(db, candidateId, {
      limit,
      offset,
    });

    const resolved = await resolveApplicationStages(db, result.rows);
    const applications = result.rows.map((row) => {
      const r = resolved.get(row);
      return r
        ? {
            ...row,
            stage_label: r.stageLabel,
            stage_color: r.stageColor,
            sub_stage_code: r.subStageCode,
            sub_stage_label: r.subStageLabel,
            sub_stage_is_passed: r.subStageIsPassed,
          }
        : row;
    });

    return Response.json({
      applications,
      pagination: {
        limit: result.limit,
        offset: result.offset,
        total: result.total,
        hasMore: result.offset + result.rows.length < result.total,
      },
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load applications.";
    return Response.json({ error: message }, { status: 500 });
  }
}
