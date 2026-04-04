import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import {
  optionalDateToDb,
  optionalToDb,
  requiredLine,
  utcDateStringToday,
} from "@/lib/jd/normalize-text";
import {
  isJdStatus,
  type JdStatus,
  type JobDescriptionFormData,
} from "@/lib/jd/types";

/** Shape returned by sanitize() in POST /api/admin/job-descriptions */
type SanitizedJdInsertPayload = {
  position: string;
  department: string | null;
  employment_status: string | null;
  update_note: string | null;
  work_location: string | null;
  reporting: string | null;
  role_overview: string | null;
  duties_and_responsibilities: string | null;
  experience_requirements_must_have: string | null;
  experience_requirements_nice_to_have: string | null;
  what_we_offer: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string) {
  return UUID_RE.test(s);
}

type CreateBody = Partial<JobDescriptionFormData> & {
  jdDraftJobOpeningId?: string | null;
};

function sanitize(body: Partial<JobDescriptionFormData>): SanitizedJdInsertPayload {
  const status =
    body.status !== undefined && isJdStatus(String(body.status))
      ? (body.status as JdStatus)
      : "Pending";
  const endDate =
    status === "Done" || status === "Closed" ? utcDateStringToday() : null;
  return {
    position: requiredLine(body.position, 50),
    department: optionalToDb(body.department, 50),
    employment_status: optionalToDb(body.employment_status, 50),
    status,
    update_note: optionalToDb(body.update_note, 50),
    work_location: optionalToDb(body.work_location, 255),
    reporting: optionalToDb(body.reporting, 255),
    role_overview: optionalToDb(body.role_overview, 255),
    duties_and_responsibilities: optionalToDb(body.duties_and_responsibilities),
    experience_requirements_must_have: optionalToDb(
      body.experience_requirements_must_have,
    ),
    experience_requirements_nice_to_have: optionalToDb(
      body.experience_requirements_nice_to_have,
    ),
    what_we_offer: optionalToDb(body.what_we_offer),
    start_date: optionalDateToDb(body.start_date),
    end_date: endDate,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  let query = auth.supabase
    .from("job_descriptions")
    .select("*")
    .order("created_at", { ascending: false });

  if (status && isJdStatus(status)) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ jobDescriptions: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const jdDraftJobOpeningIdRaw =
    typeof body.jdDraftJobOpeningId === "string"
      ? body.jdDraftJobOpeningId.trim()
      : "";
  const jdDraftJobOpeningId =
    jdDraftJobOpeningIdRaw && isUuid(jdDraftJobOpeningIdRaw)
      ? jdDraftJobOpeningIdRaw
      : null;

  const { jdDraftJobOpeningId: _ignore, ...formFields } = body;
  void _ignore;

  const payload = sanitize(formFields);
  if (!payload.position) {
    return Response.json({ error: "position is required." }, { status: 400 });
  }

  if (jdDraftJobOpeningId) {
    const { data: jo, error: joErr } = await auth.supabase
      .from("job_openings")
      .select("id, status, jd_storage_path, job_description_id")
      .eq("id", jdDraftJobOpeningId)
      .maybeSingle();

    if (joErr) {
      return Response.json({ error: joErr.message }, { status: 500 });
    }
    if (
      !jo ||
      jo.status !== "Draft" ||
      !jo.jd_storage_path ||
      jo.job_description_id != null
    ) {
      return Response.json(
        {
          error:
            "Invalid draft job opening: must be Draft with a JD file and not already linked.",
        },
        { status: 400 },
      );
    }
  }

  const { data, error } = await auth.supabase
    .from("job_descriptions")
    .insert({ ...payload, created_by: auth.userId, updated_by: auth.userId })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (jdDraftJobOpeningId && data) {
    const { error: linkErr } = await auth.supabase
      .from("job_openings")
      .update({
        job_description_id: data.id,
        title: data.position,
      })
      .eq("id", jdDraftJobOpeningId)
      .eq("status", "Draft");

    if (linkErr) {
      await auth.supabase.from("job_descriptions").delete().eq("id", data.id);
      return Response.json(
        { error: `Saved JD but could not link file: ${linkErr.message}` },
        { status: 500 },
      );
    }
  }

  return Response.json({ jobDescription: data }, { status: 201 });
}
