import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { optionalToDb, requiredLine } from "@/lib/jd/normalize-text";
import type { JdStatus, JobDescriptionFormData } from "@/lib/jd/types";

type RouteContext = { params: Promise<{ id: string }> };

const VALID_STATUSES: JdStatus[] = ["Active", "Draft", "Closed"];

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function sanitize(body: Partial<JobDescriptionFormData>) {
  const result: Record<string, string | null> = {
    duties_and_responsibilities: optionalToDb(body.duties_and_responsibilities),
    experience_requirements_must_have: optionalToDb(
      body.experience_requirements_must_have,
    ),
    experience_requirements_nice_to_have: optionalToDb(
      body.experience_requirements_nice_to_have,
    ),
    what_we_offer: optionalToDb(body.what_we_offer),
  };

  if (body.position !== undefined) {
    const p = requiredLine(body.position, 50);
    result.position = p === "" ? null : p;
  }
  if (body.department !== undefined)
    result.department = optionalToDb(body.department, 50);
  if (body.employment_status !== undefined)
    result.employment_status = optionalToDb(body.employment_status, 50);
  if (body.update_note !== undefined)
    result.update_note = optionalToDb(body.update_note, 50);
  if (body.work_location !== undefined)
    result.work_location = optionalToDb(body.work_location, 255);
  if (body.reporting !== undefined)
    result.reporting = optionalToDb(body.reporting, 255);
  if (body.role_overview !== undefined)
    result.role_overview = optionalToDb(body.role_overview, 255);
  if (
    body.status !== undefined &&
    VALID_STATUSES.includes(body.status as JdStatus)
  ) {
    result.status = body.status as string;
  }

  return result;
}

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const numId = parseId(id);
  if (!numId) return Response.json({ error: "Invalid id." }, { status: 400 });

  const { data, error } = await auth.supabase
    .from("job_descriptions")
    .select("*")
    .eq("id", numId)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Not found." }, { status: 404 });

  return Response.json({ jobDescription: data });
}

export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const numId = parseId(id);
  if (!numId) return Response.json({ error: "Invalid id." }, { status: 400 });

  let body: Partial<JobDescriptionFormData>;
  try {
    body = (await request.json()) as Partial<JobDescriptionFormData>;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const payload = sanitize(body);
  if (payload.position === null || payload.position === undefined) {
    delete payload.position;
  }

  const { data, error } = await auth.supabase
    .from("job_descriptions")
    .update({ ...payload, updated_by: auth.userId })
    .eq("id", numId)
    .select()
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Not found." }, { status: 404 });

  return Response.json({ jobDescription: data });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const numId = parseId(id);
  if (!numId) return Response.json({ error: "Invalid id." }, { status: 400 });

  const { error } = await auth.supabase
    .from("job_descriptions")
    .delete()
    .eq("id", numId);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return new Response(null, { status: 204 });
}
