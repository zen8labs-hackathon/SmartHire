import {
  assertChapterIdsExist,
  parseViewerChapterIds,
  parseViewerEmailInput,
  replaceJobDescriptionViewerChapters,
  resolveViewerEmailsToUserIds,
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
  /** Recruiter accounts that may open this JD (must already exist in Auth). */
  viewerEmails?: string[] | string | null;
  /** Chapter ids: all members of these chapters may open this JD. */
  viewerChapterIds?: string[] | null;
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
  const auth = await requireStaffForRequest(request);
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

  const jds = data ?? [];
  if (jds.length === 0) {
    return Response.json({ jobDescriptions: [] });
  }

  const { data: openings, error: openingsError } = await auth.supabase
    .from("job_openings")
    .select("id, job_description_id, jd_storage_path, created_at")
    .not("job_description_id", "is", null);

  if (openingsError) {
    return Response.json({ error: openingsError.message }, { status: 500 });
  }

  const { data: candRows, error: candError } = await auth.supabase
    .from("candidates")
    .select("job_opening_id")
    .not("job_opening_id", "is", null);

  if (candError) {
    return Response.json({ error: candError.message }, { status: 500 });
  }

  const jdIdByOpening = new Map<string, number>();
  const openingsByJd = new Map<number, { jd_storage_path: string | null; created_at: string }[]>();
  for (const o of openings ?? []) {
    const jdId = o.job_description_id as number | null;
    const oid = o.id as string;
    if (jdId == null) continue;
    jdIdByOpening.set(oid, jdId);
    const list = openingsByJd.get(jdId) ?? [];
    list.push({
      jd_storage_path: (o.jd_storage_path as string | null) ?? null,
      created_at: String(o.created_at),
    });
    openingsByJd.set(jdId, list);
  }

  const applicantCountByJd = new Map<number, number>();
  for (const c of candRows ?? []) {
    const joId = c.job_opening_id as string | null;
    if (!joId) continue;
    const jdId = jdIdByOpening.get(joId);
    if (jdId == null) continue;
    applicantCountByJd.set(jdId, (applicantCountByJd.get(jdId) ?? 0) + 1);
  }

  const enriched = jds.map((row: Record<string, unknown>) => {
    const id = row.id as number;
    const list = openingsByJd.get(id) ?? [];
    const withFile = list
      .filter((x) => x.jd_storage_path)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )[0];
    return {
      ...row,
      applicant_count: applicantCountByJd.get(id) ?? 0,
      has_jd_source_file: Boolean(withFile?.jd_storage_path),
    };
  });

  return Response.json({ jobDescriptions: enriched });
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

  const {
    jdDraftJobOpeningId: _ignore,
    viewerEmails: viewerEmailsRaw,
    viewerChapterIds: viewerChapterIdsRaw,
    ...formFields
  } = body;
  void _ignore;

  const viewerEmails = parseViewerEmailInput(viewerEmailsRaw);
  const viewerChapterIds = parseViewerChapterIds(
    viewerChapterIdsRaw ?? undefined,
  );

  const needsAdminClient =
    viewerEmails.length > 0 || viewerChapterIds.length > 0;
  let adminForViewers: ReturnType<typeof createAdminClient> | null = null;
  if (needsAdminClient) {
    try {
      adminForViewers = createAdminClient();
    } catch {
      return Response.json(
        { error: "Server missing service role key for viewer lookup." },
        { status: 500 },
      );
    }
    if (viewerEmails.length > 0) {
      const { notFound } = await resolveViewerEmailsToUserIds(
        adminForViewers,
        viewerEmails,
      );
      if (notFound.length > 0) {
        return Response.json(
          {
            error: `Unknown account email(s): ${notFound.join(", ")}. Create the user first.`,
          },
          { status: 400 },
        );
      }
    }
    if (viewerChapterIds.length > 0) {
      const chapterCheck = await assertChapterIdsExist(
        adminForViewers,
        viewerChapterIds,
      );
      if (!chapterCheck.ok) {
        return Response.json(
          {
            error: `Unknown chapter id(s): ${chapterCheck.unknownIds.join(", ")}.`,
          },
          { status: 400 },
        );
      }
    }
  }

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

  if (data?.id != null && (viewerEmails.length > 0 || viewerChapterIds.length > 0)) {
    try {
      const admin = adminForViewers ?? createAdminClient();
      if (viewerEmails.length > 0) {
        await syncJobDescriptionViewersFromEmails(admin, {
          jobDescriptionId: data.id as number,
          emails: viewerEmails,
          grantedBy: auth.userId,
        });
      }
      if (viewerChapterIds.length > 0) {
        await replaceJobDescriptionViewerChapters(admin, {
          jobDescriptionId: data.id as number,
          chapterIds: viewerChapterIds,
          grantedBy: auth.userId,
        });
      }
    } catch (e) {
      await auth.supabase.from("job_descriptions").delete().eq("id", data.id);
      const msg = e instanceof Error ? e.message : "Viewer sync failed.";
      return Response.json({ error: msg }, { status: 500 });
    }
  }

  return Response.json({ jobDescription: data }, { status: 201 });
}
