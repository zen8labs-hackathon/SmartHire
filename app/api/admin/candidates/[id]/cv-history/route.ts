import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { fetchCvReplacementChainNewestFirst } from "@/lib/candidates/candidate-cv-replacement-chain";
import { buildCvManagementVersionList } from "@/lib/candidates/cv-management-version-list";
import type { CandidateCvHistoryRow } from "@/lib/candidates/cv-history-types";
import type { CvDetailRollbackSnapshot } from "@/lib/candidates/cv-detail-version-snapshot";
import { isMissingCvVersionEventsTable } from "@/lib/candidates/cv-versioning-schema-guard";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type VersionEventRow = {
  id: number;
  version: number;
  event_type: string;
  change_summary: string | null;
  created_at: string;
  snapshot: unknown;
};

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: candidateId } = await params;
  if (!candidateId || !UUID_RE.test(candidateId)) {
    return Response.json({ error: "Invalid candidate id." }, { status: 400 });
  }

  const { data: activeRow, error: activeErr } = await auth.supabase
    .from("candidates")
    .select("id, cv_uploaded_at, updated_at, created_at, is_active")
    .eq("id", candidateId)
    .maybeSingle();

  if (activeErr) {
    return Response.json({ error: activeErr.message }, { status: 500 });
  }
  if (!activeRow) {
    return Response.json({ error: "Candidate not found." }, { status: 404 });
  }

  const { chain, error: chainErr } = await fetchCvReplacementChainNewestFirst(
    auth.supabase,
    candidateId,
  );
  if (chainErr) {
    return Response.json({ error: chainErr.message }, { status: 500 });
  }

  const previousIds = [
    ...new Set(chain.map((h) => String(h.previous_candidate_id))),
  ].filter((id) => UUID_RE.test(id));

  const snapshotById = new Map<
    string,
    {
      id: string;
      name: string | null;
      role: string | null;
      cvUploadedAt: string | null;
      parsingStatus: string;
      parsedPayload: unknown;
      originalFilename: string;
    }
  >();

  if (previousIds.length > 0) {
    const { data: prevRows, error: prevErr } = await auth.supabase
      .from("candidates")
      .select(
        "id, name, role, cv_uploaded_at, parsing_status, parsed_payload, original_filename",
      )
      .in("id", previousIds);

    if (prevErr) {
      return Response.json({ error: prevErr.message }, { status: 500 });
    }

    for (const r of prevRows ?? []) {
      const id = String(r.id);
      snapshotById.set(id, {
        id,
        name: (r.name as string | null) ?? null,
        role: (r.role as string | null) ?? null,
        cvUploadedAt: (r.cv_uploaded_at as string | null) ?? null,
        parsingStatus: String(r.parsing_status ?? "pending"),
        parsedPayload: r.parsed_payload,
        originalFilename: String(r.original_filename ?? ""),
      });
    }
  }

  const baseHistory: CandidateCvHistoryRow[] = chain.map((row) => ({
    id: Number(row.id),
    previousCandidateId: String(row.previous_candidate_id),
    replacementCandidateId: String(row.replacement_candidate_id),
    previousStatus: String(row.previous_status ?? "New"),
    newStatus: String(row.new_status ?? "New"),
    matchedOn: String(row.matched_on ?? "email_or_phone"),
    previousFilename: (row.previous_filename as string | null) ?? null,
    previousCvUploadedAt: (row.previous_cv_uploaded_at as string | null) ?? null,
    replacedByEmail: (row.replaced_by_email as string | null) ?? null,
    replacedAt: (row.replaced_at as string | null) ?? null,
    previousSnapshot:
      snapshotById.get(String(row.previous_candidate_id)) ?? null,
  }));

  const { data: eventRows, error: evErr } = await auth.supabase
    .from("candidate_cv_detail_version_events")
    .select("id, version, event_type, change_summary, created_at, snapshot")
    .eq("active_candidate_id", candidateId)
    .order("created_at", { ascending: false });

  if (evErr && !isMissingCvVersionEventsTable(evErr)) {
    return Response.json({ error: evErr.message }, { status: 500 });
  }

  const eventsNewestFirst = (eventRows ?? []).map((r) => {
    const row = r as unknown as VersionEventRow;
    const et = row.event_type;
    const eventType: "profile_edit" | "pre_restore" | "full_restore" =
      et === "profile_edit" || et === "pre_restore" || et === "full_restore"
        ? et
        : "profile_edit";
    return {
      id: row.id,
      version: row.version,
      eventType,
      changeSummary: row.change_summary,
      createdAt: row.created_at,
      snapshot: row.snapshot as CvDetailRollbackSnapshot,
    };
  });

  const ar = activeRow as Record<string, unknown>;
  const activeSortAt = String(
    (ar.updated_at as string | null)?.trim() ||
      (ar.cv_uploaded_at as string | null)?.trim() ||
      (ar.created_at as string | null) ||
      "",
  );

  const versions = buildCvManagementVersionList({
    activeCandidateId: candidateId,
    activeSortAt: activeSortAt || new Date().toISOString(),
    historyRowsNewestFirst: baseHistory,
    eventsNewestFirst,
  });

  return Response.json({ history: baseHistory, versions });
}
