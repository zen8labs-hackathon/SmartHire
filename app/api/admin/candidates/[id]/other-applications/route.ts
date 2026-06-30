import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import {
  parsedContactFromPayload,
  hasPhoneMatch,
} from "@/lib/candidates/duplicate-detection";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OtherApplicationItem = {
  id: string;
  cvDownloadUrl: string;
  jobTitle: string;
  cvUploadedAt: string | null;
  name: string | null;
};

type RawRow = {
  id: unknown;
  name: unknown;
  parsed_payload: unknown;
  cv_uploaded_at: unknown;
  cv_storage_path: unknown;
  job_openings: unknown;
};

function jobTitleFromRaw(jo: unknown): string {
  if (!jo || typeof jo !== "object") return "Unassigned";
  const j = jo as Record<string, unknown>;
  const jds = j.job_descriptions;
  const firstJd = Array.isArray(jds) ? jds[0] : jds;
  if (firstJd && typeof firstJd === "object") {
    const pos = (firstJd as Record<string, unknown>).position;
    if (typeof pos === "string" && pos.trim()) return pos.trim();
  }
  const title = j.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  return "—";
}

type RouteContext = { params: Promise<{ id: string }> };

const CV_FIELDS =
  "id, name, parsed_payload, cv_uploaded_at, cv_storage_path, job_openings!job_opening_id ( id, title, job_descriptions ( position ) )";

/**
 * Returns other active candidate rows that share the same email or phone
 * as the given candidate (i.e. other applications from the same person).
 */
export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: candidateId } = await params;
  if (!candidateId || !UUID_RE.test(candidateId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const { data: current, error: currentErr } = await auth.supabase
    .from("candidates")
    .select("id, parsed_payload, is_active")
    .eq("id", candidateId)
    .maybeSingle();

  if (currentErr) {
    return Response.json({ error: currentErr.message }, { status: 500 });
  }
  if (!current) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const contact = parsedContactFromPayload(current.parsed_payload);
  if (!contact.email && contact.phoneVariants.length === 0) {
    return Response.json({ applications: [] });
  }

  const matched = new Map<string, RawRow>();

  if (contact.email) {
    const { data: byEmail, error: emailErr } = await auth.supabase
      .from("candidates")
      .select(CV_FIELDS)
      .neq("id", candidateId)
      .eq("is_active", true)
      .ilike("parsed_payload->>email", contact.email);

    if (emailErr) {
      return Response.json({ error: emailErr.message }, { status: 500 });
    }
    for (const row of (byEmail ?? []) as RawRow[]) {
      matched.set(String(row.id), row);
    }
  }

  if (contact.phoneVariants.length > 0) {
    const { data: allActive, error: phoneErr } = await auth.supabase
      .from("candidates")
      .select(CV_FIELDS)
      .neq("id", candidateId)
      .eq("is_active", true);

    if (!phoneErr) {
      for (const row of (allActive ?? []) as RawRow[]) {
        const id = String(row.id);
        if (matched.has(id)) continue;
        const c = parsedContactFromPayload(row.parsed_payload);
        if (hasPhoneMatch(contact, c)) {
          matched.set(id, row);
        }
      }
    }
  }

  const baseUrl = new URL(request.url).origin;

  const applications: OtherApplicationItem[] = Array.from(matched.values()).map(
    (row) => ({
      id: String(row.id),
      cvDownloadUrl: `${baseUrl}/api/admin/candidates/${String(row.id)}/cv-download`,
      jobTitle: jobTitleFromRaw(row.job_openings),
      cvUploadedAt:
        typeof row.cv_uploaded_at === "string" ? row.cv_uploaded_at : null,
      name: typeof row.name === "string" ? row.name : null,
    }),
  );

  return Response.json({ applications });
}
