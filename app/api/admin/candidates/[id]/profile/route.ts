import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { ADMIN_CANDIDATES_SELECT } from "@/lib/candidates/admin-select";
import {
  candidateProfilePatchSchema,
  mergeProfileIntoParsedPayload,
  patchInputToMergeFields,
} from "@/lib/candidates/candidate-profile-patch";
import {
  CV_DETAIL_SNAPSHOT_SELECT,
  snapshotFromCandidateRow,
} from "@/lib/candidates/cv-detail-version-snapshot";
import {
  isMissingCvDetailVersionColumn,
  isMissingCvVersionEventsTable,
  versioningMigrationRequiredResponse,
} from "@/lib/candidates/cv-versioning-schema-guard";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import { enrichCandidatesWithJobOpenings } from "@/lib/candidates/enrich-candidates-job-openings";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

type CandidateProfileExistingRow = {
  id: string;
  is_active: boolean;
  cv_detail_version: number | null;
  parsed_payload: unknown;
  source?: string | null;
  source_other?: string | null;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: candidateId } = await params;
  if (!candidateId || !UUID_RE.test(candidateId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = candidateProfilePatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }

  const patch = parsed.data;
  const changeSummary =
    patch.change_summary !== undefined ? patch.change_summary : null;

  const loadSelect = [
    "id",
    "is_active",
    "cv_detail_version",
    CV_DETAIL_SNAPSHOT_SELECT,
  ].join(", ");

  const { data: existing, error: loadError } = await auth.supabase
    .from("candidates")
    .select(loadSelect)
    .eq("id", candidateId)
    .maybeSingle();

  if (loadError) {
    if (isMissingCvDetailVersionColumn(loadError)) {
      return versioningMigrationRequiredResponse();
    }
    return Response.json({ error: loadError.message }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const ex = existing as unknown as CandidateProfileExistingRow;

  if (!ex.is_active) {
    return Response.json(
      { error: "Archived candidate cannot be updated." },
      { status: 409 },
    );
  }

  const nextSource =
    patch.source !== undefined ? patch.source : String(ex.source ?? "Other");
  const existingOther = ex.source_other;
  const nextSourceOther =
    patch.source_other !== undefined ? patch.source_other : existingOther;

  if (nextSource === "Other") {
    const detail =
      typeof nextSourceOther === "string" ? nextSourceOther.trim() : "";
    if (!detail) {
      return Response.json(
        {
          error:
            "When source is Other, source_other must be a non-empty description (or set source to a fixed channel).",
        },
        { status: 400 },
      );
    }
  }

  const rowUpdate: Record<string, unknown> = {};
  if (patch.name !== undefined) rowUpdate.name = patch.name;
  if (patch.role !== undefined) rowUpdate.role = patch.role;
  if (patch.degree !== undefined) rowUpdate.degree = patch.degree;
  if (patch.school !== undefined) rowUpdate.school = patch.school;
  if (patch.experience_years !== undefined) {
    rowUpdate.experience_years = patch.experience_years;
  }
  if (patch.skills !== undefined) rowUpdate.skills = patch.skills;
  if (patch.source !== undefined) rowUpdate.source = patch.source;
  if (patch.source !== undefined && patch.source !== "Other") {
    rowUpdate.source_other = null;
  } else if (patch.source_other !== undefined) {
    rowUpdate.source_other = patch.source_other;
  }

  const mergeFields = patchInputToMergeFields(patch);
  if (Object.keys(mergeFields).length > 0) {
    const mergedPayload = mergeProfileIntoParsedPayload(
      ex.parsed_payload,
      mergeFields,
    );
    rowUpdate.parsed_payload = mergedPayload;
  }

  if (Object.keys(rowUpdate).length === 0) {
    return Response.json({ error: "No updates to apply." }, { status: 400 });
  }

  const currentVersionRaw = (ex as { cv_detail_version?: unknown })
    .cv_detail_version;
  const currentVersion =
    typeof currentVersionRaw === "number" &&
    Number.isFinite(currentVersionRaw) &&
    currentVersionRaw >= 1
      ? currentVersionRaw
      : 1;

  const preImageSnap = snapshotFromCandidateRow(
    existing as unknown as Record<string, unknown>,
  );

  const { error: evErr } = await auth.supabase
    .from("candidate_cv_detail_version_events")
    .insert({
      active_candidate_id: candidateId,
      version: currentVersion,
      event_type: "profile_edit",
      change_summary: changeSummary,
      snapshot: preImageSnap,
    });

  if (evErr) {
    if (isMissingCvVersionEventsTable(evErr)) {
      return versioningMigrationRequiredResponse();
    }
    return Response.json({ error: evErr.message }, { status: 500 });
  }

  rowUpdate.cv_detail_version = currentVersion + 1;

  const { error: upErr } = await auth.supabase
    .from("candidates")
    .update(rowUpdate)
    .eq("id", candidateId);

  if (upErr) {
    if (isMissingCvDetailVersionColumn(upErr)) {
      return versioningMigrationRequiredResponse();
    }
    return Response.json({ error: upErr.message }, { status: 500 });
  }

  const { data: row, error: selErr } = await auth.supabase
    .from("candidates")
    .select(ADMIN_CANDIDATES_SELECT)
    .eq("id", candidateId)
    .maybeSingle();

  if (selErr) {
    if (isMissingCvDetailVersionColumn(selErr)) {
      return versioningMigrationRequiredResponse();
    }
    return Response.json(
      { error: selErr.message ?? "Could not load updated candidate." },
      { status: 500 },
    );
  }
  if (!row) {
    return Response.json(
      { error: "Could not load updated candidate." },
      { status: 500 },
    );
  }

  const [enriched] = await enrichCandidatesWithJobOpenings(auth.supabase, [
    row as unknown as CandidateDbRow,
  ]);

  return Response.json({ candidate: enriched });
}
