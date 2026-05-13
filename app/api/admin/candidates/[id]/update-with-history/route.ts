import { z } from "zod";

import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { isValidEmail, normalizeEmail } from "@/lib/auth/email";
import { ADMIN_CANDIDATES_SELECT } from "@/lib/candidates/admin-select";
import {
  CV_DETAIL_SNAPSHOT_SELECT,
  rowUpdateFromCvDetailSnapshot,
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

const bodySchema = z
  .object({
    newCandidateId: z.string().regex(UUID_RE),
    matchedOn: z
      .enum([
        "email",
        "phone",
        "email_or_phone",
        "cv_content",
        "cv_file",
      ])
      .optional(),
  })
  .strict();

export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: existingId } = await params;
  if (!existingId || !UUID_RE.test(existingId)) {
    return Response.json({ error: "Invalid candidate id." }, { status: 400 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const { newCandidateId, matchedOn: matchedOnRaw } = parsed.data;
  if (newCandidateId === existingId) {
    return Response.json(
      { error: "newCandidateId must differ from the existing candidate id." },
      { status: 400 },
    );
  }

  const matchedOn =
    matchedOnRaw === "email" ||
    matchedOnRaw === "phone" ||
    matchedOnRaw === "email_or_phone" ||
    matchedOnRaw === "cv_content" ||
    matchedOnRaw === "cv_file"
      ? matchedOnRaw
      : "email_or_phone";

  const loadSelect = [
    "id",
    "is_active",
    "cv_detail_version",
    "status",
    "job_opening_id",
    "interview_at",
    "onboarding_at",
    CV_DETAIL_SNAPSHOT_SELECT,
  ].join(", ");

  const { data: eRow, error: eErr } = await auth.supabase
    .from("candidates")
    .select(loadSelect)
    .eq("id", existingId)
    .maybeSingle();

  if (eErr) {
    if (isMissingCvDetailVersionColumn(eErr)) {
      return versioningMigrationRequiredResponse();
    }
    return Response.json({ error: eErr.message }, { status: 500 });
  }
  if (!eRow) {
    return Response.json({ error: "Existing candidate not found." }, { status: 404 });
  }

  const e = eRow as unknown as Record<string, unknown>;
  if (e.is_active === false) {
    return Response.json(
      { error: "Existing candidate is not active." },
      { status: 409 },
    );
  }

  const { data: nRow, error: nErr } = await auth.supabase
    .from("candidates")
    .select(loadSelect)
    .eq("id", newCandidateId)
    .maybeSingle();

  if (nErr) {
    if (isMissingCvDetailVersionColumn(nErr)) {
      return versioningMigrationRequiredResponse();
    }
    return Response.json({ error: nErr.message }, { status: 500 });
  }
  if (!nRow) {
    return Response.json({ error: "New upload candidate not found." }, { status: 404 });
  }

  const n = nRow as unknown as Record<string, unknown>;
  if (n.is_active === false) {
    return Response.json(
      { error: "New upload candidate is already archived." },
      { status: 409 },
    );
  }

  const currentVersionRaw = e.cv_detail_version;
  const currentVersion =
    typeof currentVersionRaw === "number" &&
    Number.isFinite(currentVersionRaw) &&
    currentVersionRaw >= 1
      ? currentVersionRaw
      : 1;

  const preImageSnap = snapshotFromCandidateRow(e);

  const { error: evErr } = await auth.supabase
    .from("candidate_cv_detail_version_events")
    .insert({
      active_candidate_id: existingId,
      version: currentVersion,
      event_type: "pre_restore",
      change_summary: "Merged duplicate upload into this profile",
      snapshot: preImageSnap,
    });

  if (evErr) {
    if (isMissingCvVersionEventsTable(evErr)) {
      return versioningMigrationRequiredResponse();
    }
    return Response.json({ error: evErr.message }, { status: 500 });
  }

  const fromNew = rowUpdateFromCvDetailSnapshot(snapshotFromCandidateRow(n));

  const preservedJobOpeningId =
    e.job_opening_id == null ? n.job_opening_id ?? null : e.job_opening_id;

  const mergedUpdate: Record<string, unknown> = {
    ...fromNew,
    job_opening_id: preservedJobOpeningId,
    status: e.status,
    interview_at: e.interview_at,
    onboarding_at: e.onboarding_at,
    cv_detail_version: currentVersion + 1,
  };

  const { error: upErr } = await auth.supabase
    .from("candidates")
    .update(mergedUpdate)
    .eq("id", existingId)
    .eq("is_active", true);

  if (upErr) {
    if (isMissingCvDetailVersionColumn(upErr)) {
      return versioningMigrationRequiredResponse();
    }
    return Response.json({ error: upErr.message }, { status: 500 });
  }

  const replacedAt = new Date().toISOString();
  const actorRaw = auth.userEmail?.trim() ?? "";
  const replacedByEmail =
    actorRaw && isValidEmail(normalizeEmail(actorRaw))
      ? normalizeEmail(actorRaw)
      : null;

  const { error: archErr } = await auth.supabase
    .from("candidates")
    .update({
      is_active: false,
      replaced_by_candidate_id: existingId,
      replaced_at: replacedAt,
      replaced_reason: "merged_into_existing",
    })
    .eq("id", newCandidateId)
    .eq("is_active", true);

  if (archErr) {
    return Response.json({ error: archErr.message }, { status: 500 });
  }

  const { error: histErr } = await auth.supabase
    .from("candidate_cv_replacements")
    .insert({
      previous_candidate_id: newCandidateId,
      replacement_candidate_id: existingId,
      previous_status: String(n.status ?? "New"),
      new_status: String(e.status ?? "New"),
      matched_on: matchedOn,
      previous_cv_storage_path: (n.cv_storage_path as string | null) ?? null,
      previous_filename: (n.original_filename as string | null) ?? null,
      previous_mime_type: (n.mime_type as string | null) ?? null,
      previous_cv_uploaded_at:
        (n.cv_uploaded_at as string | null) ??
        (n.created_at as string | null) ??
        null,
      replaced_by_email: replacedByEmail,
      replaced_at: replacedAt,
    });

  if (histErr) {
    return Response.json({ error: histErr.message }, { status: 500 });
  }

  const { data: row, error: selErr } = await auth.supabase
    .from("candidates")
    .select(ADMIN_CANDIDATES_SELECT)
    .eq("id", existingId)
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
