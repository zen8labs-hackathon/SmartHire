import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { getPool } from "@/lib/db/config/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

type CompareRow = {
  id: string;
  original_filename: string | null;
  created_at: Date;
  role: string | null;
  experience_years: string | null;
  skills: string[] | null;
  english_level: string | null;
  education: string | null;
  degree: string | null;
};

/**
 * Parsed fields of two CV versions of one candidate, for the side-by-side
 * compare dialog (UC-03-03). Query: ?a=<versionId>&b=<versionId>.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  const url = new URL(request.url);
  const a = url.searchParams.get("a") ?? "";
  const b = url.searchParams.get("b") ?? "";
  if (!UUID_RE.test(a) || !UUID_RE.test(b)) {
    return Response.json({ error: "Choose two CV versions." }, { status: 400 });
  }

  try {
    const { rows } = await getPool().query<CompareRow>(
      `SELECT v.id, v.original_filename, v.created_at, v.role, v.experience_years,
              v.skills, v.english_level, v.education, v.degree
         FROM cv_detail_versions v
         JOIN campaign_applied ca ON ca.id = v.campaign_applied_id
        WHERE ca.candidate_id = $1 AND ca.deleted_at IS NULL AND v.id = ANY($2::uuid[])`,
      [id, [a, b]],
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    const left = byId.get(a);
    const right = byId.get(b);
    if (!left || !right) {
      return Response.json({ error: "CV version not found." }, { status: 404 });
    }
    const shape = (r: CompareRow) => ({
      id: r.id,
      file: r.original_filename ?? "CV",
      createdAt: r.created_at,
      role: r.role,
      experienceYears: r.experience_years,
      skills: r.skills ?? [],
      english: r.english_level,
      education: [r.degree, r.education].filter(Boolean).join(" · ") || null,
    });
    return Response.json({ a: shape(left), b: shape(right) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to compare CVs.";
    return Response.json({ error: message }, { status: 500 });
  }
}
