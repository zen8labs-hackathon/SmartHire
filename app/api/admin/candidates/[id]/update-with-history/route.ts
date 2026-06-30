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
  versioningMigrationRequiredResponse,
} from "@/lib/candidates/cv-versioning-schema-guard";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import { enrichCandidatesWithJobOpenings } from "@/lib/candidates/enrich-candidates-job-openings";
import { CV_BUCKET } from "@/lib/candidates/upload-constants";
import {
  sanitizeFolderName,
  getFormattedTimestamp,
  extractFolderNameFromPath,
} from "@/lib/candidates/cv-path-utils";
import { newUuidV8 } from "@/lib/uuid-v8";

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

  const fromNew = rowUpdateFromCvDetailSnapshot(snapshotFromCandidateRow(n));

  const preservedJobOpeningId =
    (e.job_opening_id == null ? n.job_opening_id ?? null : e.job_opening_id) as string | null;

  // 1. Determine existing candidate folder structure
  let existingFolder = extractFolderNameFromPath(e.cv_storage_path as string);
  
  let jobFolder = "Job_Opening";
  const existingPathParts = (e.cv_storage_path as string || "").split("/");
  if (existingPathParts.length > 1 && existingPathParts[0].includes("_")) {
    jobFolder = existingPathParts[0];
  } else if (preservedJobOpeningId) {
    const { data: job } = await auth.supabase
      .from("job_openings")
      .select("title")
      .eq("id", preservedJobOpeningId)
      .maybeSingle();
    if (job?.title) {
      jobFolder = `${sanitizeFolderName(job.title)}_${preservedJobOpeningId}`;
    } else {
      jobFolder = preservedJobOpeningId;
    }
  }

  const timestamp = getFormattedTimestamp();

  if (!existingFolder) {
    // Migrate the old flat style to a structured folder on the fly
    const name = sanitizeFolderName(String(e.name || "Candidate"));
    existingFolder = `${name}_${timestamp}_${newUuidV8()}`;

    const oldPath = e.cv_storage_path as string;
    if (oldPath) {
      const oldFilename = e.original_filename as string || "resume.pdf";
      const extIdx = oldFilename.lastIndexOf(".");
      const ext = extIdx !== -1 ? oldFilename.substring(extIdx) : ".pdf";
      const nameWithoutExt = extIdx !== -1 ? oldFilename.substring(0, extIdx) : oldFilename;
      const sanitizedFilename = sanitizeFolderName(nameWithoutExt);
      const oldDestFilename = `${sanitizedFilename}_v1_${timestamp}${ext}`;
      const oldDestPath = `${jobFolder}/${existingFolder}/${oldDestFilename}`;

      const { error: moveOldErr } = await auth.supabase.storage
        .from(CV_BUCKET)
        .move(oldPath, oldDestPath);

      if (!moveOldErr) {
        await auth.supabase
          .from("candidates")
          .update({ cv_storage_path: oldDestPath })
          .eq("id", existingId);
        e.cv_storage_path = oldDestPath;
      }
    }
  }

  // Final path of the old CV file after any folder migration above.
  const oldCvPath = (e.cv_storage_path as string | null) ?? null;

  // 2. Move the newly uploaded file to the existing candidate's folder
  const nextVersion = currentVersion + 1;
  const newFilenameRaw = n.original_filename as string || "resume.pdf";
  const extIdx = newFilenameRaw.lastIndexOf(".");
  const ext = extIdx !== -1 ? newFilenameRaw.substring(extIdx) : ".pdf";
  const nameWithoutExt = extIdx !== -1 ? newFilenameRaw.substring(0, extIdx) : newFilenameRaw;
  const sanitizedFilename = sanitizeFolderName(nameWithoutExt);
  const newDestFilename = `${sanitizedFilename}_v${nextVersion}_${timestamp}${ext}`;
  const newDestPath = `${jobFolder}/${existingFolder}/${newDestFilename}`;

  const { error: moveNewErr } = await auth.supabase.storage
    .from(CV_BUCKET)
    .move(n.cv_storage_path as string, newDestPath);

  if (moveNewErr) {
    return Response.json(
      { error: `Failed to move updated CV to folder: ${moveNewErr.message}` },
      { status: 500 },
    );
  }

  const mergedUpdate: Record<string, unknown> = {
    ...fromNew,
    cv_storage_path: newDestPath,
    job_opening_id: preservedJobOpeningId,
    status: e.status,
    interview_at: e.interview_at,
    onboarding_at: e.onboarding_at,
    cv_detail_version: nextVersion,
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

  // Overwrite newCandidateId row with the pre-merge snapshot of existingId so
  // the archived row holds old CV data and can be previewed in version history.
  await auth.supabase
    .from("candidates")
    .update({
      ...rowUpdateFromCvDetailSnapshot(preImageSnap),
      cv_storage_path: oldCvPath,
    })
    .eq("id", newCandidateId);

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

  // Re-link the current chain head so the version walk stays linear.
  // Every update-with-history inserts replacement→existingId, but the chain
  // walker only follows one link per cursor step. Redirect any existing head
  // (replacement=existingId) to point to newCandidateId instead, then insert
  // the new head (newCandidateId→existingId) so the walk is:
  //   existingId → newCandidateId (latest old) → prevHead.previous → …
  const { data: prevChainHead } = await auth.supabase
    .from("candidate_cv_replacements")
    .select("id")
    .eq("replacement_candidate_id", existingId)
    .order("replaced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (prevChainHead) {
    await auth.supabase
      .from("candidate_cv_replacements")
      .update({ replacement_candidate_id: newCandidateId })
      .eq("id", (prevChainHead as { id: number | string }).id);
  }

  const { error: histErr } = await auth.supabase
    .from("candidate_cv_replacements")
    .insert({
      previous_candidate_id: newCandidateId,
      replacement_candidate_id: existingId,
      previous_status: String(e.status ?? "New"),
      new_status: String(e.status ?? "New"),
      matched_on: matchedOn,
      previous_cv_storage_path: oldCvPath,
      previous_filename: preImageSnap.original_filename,
      previous_mime_type: preImageSnap.mime_type,
      previous_cv_uploaded_at: preImageSnap.cv_uploaded_at,
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
