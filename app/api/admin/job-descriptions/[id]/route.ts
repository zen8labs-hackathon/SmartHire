import {
  fetchViewerEmailsForJobDescription,
  parseViewerEmailInput,
  syncJobDescriptionViewersFromEmails,
} from "@/lib/admin/jd-viewer-sync";
import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  optionalDateToDb,
  optionalToDb,
  requiredLine,
  utcDateStringToday,
} from "@/lib/jd/normalize-text";
import {
  coerceJdStatus,
  isJdStatus,
  type JobDescriptionFormData,
  type JdEditFormData,
  type JdStatus,
} from "@/lib/jd/types";

type RouteContext = { params: Promise<{ id: string }> };

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
  if (body.start_date !== undefined) {
    result.start_date = optionalDateToDb(body.start_date);
  }
  if (body.status !== undefined && isJdStatus(String(body.status))) {
    result.status = body.status;
  }

  return result;
}

function sanitizeEdit(body: Partial<JdEditFormData>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (body.level !== undefined)
    result.level = optionalToDb(body.level, 100);
  if (body.headcount !== undefined) {
    const n = body.headcount === "" ? null : Number(body.headcount);
    result.headcount = n !== null && !Number.isNaN(n) && n > 0 ? n : null;
  }
  if (body.hire_type !== undefined)
    result.hire_type = optionalToDb(body.hire_type, 50);
  if (body.reporting !== undefined)
    result.reporting = optionalToDb(body.reporting, 255);
  if (body.project_info !== undefined)
    result.project_info = optionalToDb(body.project_info);
  if (body.duties_and_responsibilities !== undefined)
    result.duties_and_responsibilities = optionalToDb(body.duties_and_responsibilities);
  if (body.team_size !== undefined)
    result.team_size = optionalToDb(body.team_size);
  if (body.experience_requirements_must_have !== undefined)
    result.experience_requirements_must_have = optionalToDb(body.experience_requirements_must_have);
  if (body.experience_requirements_nice_to_have !== undefined)
    result.experience_requirements_nice_to_have = optionalToDb(body.experience_requirements_nice_to_have);
  if (body.language_requirements !== undefined)
    result.language_requirements = optionalToDb(body.language_requirements);
  if (body.career_development !== undefined)
    result.career_development = optionalToDb(body.career_development);
  if (body.other_requirements !== undefined)
    result.other_requirements = optionalToDb(body.other_requirements);
  if (body.salary_range !== undefined)
    result.salary_range = optionalToDb(body.salary_range, 255);
  if (body.project_allowances !== undefined)
    result.project_allowances = optionalToDb(body.project_allowances);
  if (body.interview_process !== undefined)
    result.interview_process = optionalToDb(body.interview_process);
  if (body.hiring_deadline !== undefined)
    result.hiring_deadline = optionalDateToDb(body.hiring_deadline);

  return result;
}

function endDateForStatusTransition(
  prevStatus: string,
  next: JdStatus,
): string | null | undefined {
  const prev = coerceJdStatus(prevStatus);
  const prevTerminal = prev === "Done" || prev === "Closed";
  const nextTerminal = next === "Done" || next === "Closed";
  if (nextTerminal && !prevTerminal) return utcDateStringToday();
  if (!nextTerminal && prevTerminal) return null;
  return undefined;
}

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
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

  let viewerEmails: string[] = [];
  try {
    const admin = createAdminClient();
    viewerEmails = await fetchViewerEmailsForJobDescription(admin, numId);
  } catch {
    // optional
  }

  return Response.json({ jobDescription: data, viewerEmails });
}

export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const numId = parseId(id);
  if (!numId) return Response.json({ error: "Invalid id." }, { status: 400 });

  let raw: Record<string, unknown>;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const hasViewerKey = Object.prototype.hasOwnProperty.call(raw, "viewerEmails");
  const viewerEmailsRaw = raw.viewerEmails;
  delete raw.viewerEmails;

  const hasJdUpdate = Object.keys(raw).length > 0;
  if (!hasJdUpdate && !hasViewerKey) {
    return Response.json({ error: "No updates provided." }, { status: 400 });
  }

  const { data: existing, error: existingErr } = await auth.supabase
    .from("job_descriptions")
    .select("status")
    .eq("id", numId)
    .maybeSingle();

  if (existingErr) {
    return Response.json({ error: existingErr.message }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  if (hasJdUpdate) {
    const body = raw as Partial<JobDescriptionFormData> &
      Partial<JdEditFormData> & { _editMode?: boolean };

    let payload: Record<string, unknown>;

    if (body._editMode) {
      const { _editMode: _, ...editBody } = body;
      payload = sanitizeEdit(editBody as Partial<JdEditFormData>);
    } else {
      const stdPayload = sanitize(body as Partial<JobDescriptionFormData>);
      if (stdPayload.position === null || stdPayload.position === undefined) {
        delete stdPayload.position;
      }
      if (body.status !== undefined && isJdStatus(String(body.status))) {
        const endDelta = endDateForStatusTransition(
          String(existing.status),
          body.status as JdStatus,
        );
        if (endDelta !== undefined) {
          (stdPayload as Record<string, unknown>).end_date = endDelta;
        }
      }
      payload = stdPayload;
    }

    const { error } = await auth.supabase
      .from("job_descriptions")
      .update({ ...payload, updated_by: auth.userId })
      .eq("id", numId);

    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  if (hasViewerKey) {
    let admin;
    try {
      admin = createAdminClient();
    } catch {
      return Response.json(
        { error: "Server missing service role key for viewer sync." },
        { status: 500 },
      );
    }
    const emails = parseViewerEmailInput(
      viewerEmailsRaw as string | string[] | null | undefined,
    );
    const { notFound } = await syncJobDescriptionViewersFromEmails(admin, {
      jobDescriptionId: numId,
      emails,
      grantedBy: auth.userId,
    });
    if (notFound.length > 0) {
      return Response.json(
        {
          error: `Unknown account email(s): ${notFound.join(", ")}. Create the user first.`,
        },
        { status: 400 },
      );
    }
  }

  const { data: jdRow, error: jdErr } = await auth.supabase
    .from("job_descriptions")
    .select("*")
    .eq("id", numId)
    .maybeSingle();

  if (jdErr) return Response.json({ error: jdErr.message }, { status: 500 });
  if (!jdRow) return Response.json({ error: "Not found." }, { status: 404 });

  let viewerEmails: string[] = [];
  try {
    const admin = createAdminClient();
    viewerEmails = await fetchViewerEmailsForJobDescription(admin, numId);
  } catch {
    // optional
  }

  return Response.json({ jobDescription: jdRow, viewerEmails });
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
