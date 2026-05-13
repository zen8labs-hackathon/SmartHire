import { z } from "zod";

import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { ADMIN_CANDIDATES_SELECT } from "@/lib/candidates/admin-select";
import {
  chainPreviousCandidateIds,
  fetchCvReplacementChainNewestFirst,
} from "@/lib/candidates/candidate-cv-replacement-chain";
import {
  CV_DETAIL_SNAPSHOT_SELECT,
  type CvDetailRollbackSnapshot,
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

const restoreBodySchema = z
  .object({
    previousCandidateId: z.string().regex(UUID_RE).optional(),
    versionEventId: z
      .string()
      .regex(/^\d+$/)
      .transform((s) => s.trim())
      .optional(),
    note: z
      .string()
      .max(500)
      .optional()
      .transform((s) => (s === undefined ? undefined : s.trim() || undefined)),
  })
  .strict()
  .superRefine((val, ctx) => {
    const hasPrev = Boolean(val.previousCandidateId);
    const hasEv = Boolean(val.versionEventId);
    if (hasPrev === hasEv) {
      ctx.addIssue({
        code: "custom",
        message:
          "Provide exactly one of previousCandidateId (archived CV row) or versionEventId (saved snapshot).",
        path: [],
      });
    }
  });

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: activeCandidateId } = await params;
  if (!activeCandidateId || !UUID_RE.test(activeCandidateId)) {
    return Response.json({ error: "Invalid candidate id." }, { status: 400 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = restoreBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const loadSelect = [
    "id",
    "is_active",
    "cv_detail_version",
    CV_DETAIL_SNAPSHOT_SELECT,
  ].join(", ");

  const { data: activeRow, error: activeErr } = await auth.supabase
    .from("candidates")
    .select(loadSelect)
    .eq("id", activeCandidateId)
    .maybeSingle();

  if (activeErr) {
    if (isMissingCvDetailVersionColumn(activeErr)) {
      return versioningMigrationRequiredResponse();
    }
    return Response.json({ error: activeErr.message }, { status: 500 });
  }
  if (!activeRow) {
    return Response.json({ error: "Candidate not found." }, { status: 404 });
  }

  const ar = activeRow as { is_active?: boolean; cv_detail_version?: unknown };
  if (ar.is_active === false) {
    return Response.json(
      { error: "Archived candidate cannot be restored onto." },
      { status: 409 },
    );
  }

  const currentVersionRaw = ar.cv_detail_version;
  const currentVersion =
    typeof currentVersionRaw === "number" &&
    Number.isFinite(currentVersionRaw) &&
    currentVersionRaw >= 1
      ? currentVersionRaw
      : 1;

  const preImageSnap = snapshotFromCandidateRow(
    activeRow as unknown as Record<string, unknown>,
  );

  let targetUpdate: Record<string, unknown>;

  if (body.previousCandidateId) {
    const { chain, error: chainErr } = await fetchCvReplacementChainNewestFirst(
      auth.supabase,
      activeCandidateId,
    );
    if (chainErr) {
      return Response.json({ error: chainErr.message }, { status: 500 });
    }
    const allowed = chainPreviousCandidateIds(chain);
    if (!allowed.has(body.previousCandidateId)) {
      return Response.json(
        { error: "That CV version is not part of this candidate's history." },
        { status: 400 },
      );
    }

    const { data: prevRow, error: prevErr } = await auth.supabase
      .from("candidates")
      .select(loadSelect)
      .eq("id", body.previousCandidateId)
      .maybeSingle();

    if (prevErr) {
      if (isMissingCvDetailVersionColumn(prevErr)) {
        return versioningMigrationRequiredResponse();
      }
      return Response.json({ error: prevErr.message }, { status: 500 });
    }
    if (!prevRow) {
      return Response.json({ error: "Archived candidate not found." }, { status: 404 });
    }
    const pr = prevRow as { is_active?: boolean };
    if (pr.is_active !== false) {
      return Response.json(
        { error: "Restore target must be an archived CV row." },
        { status: 400 },
      );
    }

    targetUpdate = rowUpdateFromCvDetailSnapshot(
      snapshotFromCandidateRow(prevRow as unknown as Record<string, unknown>),
    );
  } else {
    const evId = Number(body.versionEventId);
    if (!Number.isFinite(evId) || evId < 1) {
      return Response.json({ error: "Invalid versionEventId." }, { status: 400 });
    }

    const { data: evRow, error: evErr } = await auth.supabase
      .from("candidate_cv_detail_version_events")
      .select("id, snapshot, active_candidate_id")
      .eq("id", evId)
      .maybeSingle();

    if (evErr) {
      if (isMissingCvVersionEventsTable(evErr)) {
        return versioningMigrationRequiredResponse();
      }
      return Response.json({ error: evErr.message }, { status: 500 });
    }
    if (!evRow) {
      return Response.json({ error: "Version event not found." }, { status: 404 });
    }
    const ev = evRow as { active_candidate_id?: string; snapshot?: unknown };
    if (String(ev.active_candidate_id) !== activeCandidateId) {
      return Response.json({ error: "Version event does not belong here." }, { status: 400 });
    }

    targetUpdate = rowUpdateFromCvDetailSnapshot(
      ev.snapshot as CvDetailRollbackSnapshot,
    );
  }

  const { error: evInsErr } = await auth.supabase
    .from("candidate_cv_detail_version_events")
    .insert({
      active_candidate_id: activeCandidateId,
      version: currentVersion,
      event_type: "pre_restore",
      change_summary: body.note ?? null,
      snapshot: preImageSnap,
    });

  if (evInsErr) {
    if (isMissingCvVersionEventsTable(evInsErr)) {
      return versioningMigrationRequiredResponse();
    }
    return Response.json({ error: evInsErr.message }, { status: 500 });
  }

  const { error: upErr } = await auth.supabase
    .from("candidates")
    .update({
      ...targetUpdate,
      cv_detail_version: currentVersion + 1,
    })
    .eq("id", activeCandidateId);

  if (upErr) {
    if (isMissingCvDetailVersionColumn(upErr)) {
      return versioningMigrationRequiredResponse();
    }
    return Response.json({ error: upErr.message }, { status: 500 });
  }

  const { data: row, error: selErr } = await auth.supabase
    .from("candidates")
    .select(ADMIN_CANDIDATES_SELECT)
    .eq("id", activeCandidateId)
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
