import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { getCandidate2Detail } from "@/lib/db/candidates-detail2";
import { END_REASONS, type EndReason } from "@/lib/candidates/cooldown";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

const REASON_LABEL: Record<EndReason, string> = {
  skills: "Skills gap",
  salary: "Salary mismatch",
  culture: "Culture or team fit",
  withdrew: "Candidate withdrew",
  noshow: "No-show",
  closed: "Position closed or filled",
  other: "Other",
};

/**
 * Record why an application ended (UC-05, BR-05-02). Body:
 * { applicationId, reason, note }. "other" needs a note. Only applications
 * that already ended can be given a reason; the stage move itself happens in
 * the pipeline, not here.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  let body: { applicationId?: unknown; reason?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { applicationId } = body;
  const reason = body.reason as EndReason;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
  if (typeof applicationId !== "string" || !UUID_RE.test(applicationId)) {
    return Response.json({ error: "applicationId is required." }, { status: 400 });
  }
  if (!END_REASONS.includes(reason)) {
    return Response.json({ error: "Choose a reason." }, { status: 400 });
  }
  if (reason === "other" && !note) {
    return Response.json({ error: "A note is required for Other." }, { status: 400 });
  }

  try {
    const db = getPool();
    const result = await withTransaction(async (tx) => {
      const { rows } = await tx.query<{ title: string | null }>(
        `WITH upd AS (
           UPDATE campaign_applied
              SET end_reason = $3, end_note = $4
            WHERE id = $2 AND candidate_id = $1 AND deleted_at IS NULL
              AND ended_at IS NOT NULL
            RETURNING job_id)
         SELECT j.position AS title
           FROM upd LEFT JOIN jobs j ON j.id = upd.job_id`,
        [id, applicationId, reason, note || null],
      );
      if (!rows.length) return null;
      await tx.query(
        `INSERT INTO candidate_timeline_events
           (candidate_id, campaign_applied_id, type, title, detail, by_user_id)
         VALUES ($1, $2, 'reason', $3, $4, $5)`,
        [
          id,
          applicationId,
          `Reason recorded: ${REASON_LABEL[reason]}${rows[0].title ? ` · ${rows[0].title}` : ""}`,
          note || null,
          auth.userId ?? null,
        ],
      );
      return true;
    });
    if (!result) {
      return Response.json({ error: "Application not found or has not ended." }, { status: 404 });
    }
    return Response.json(await getCandidate2Detail(db, id));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save reason.";
    return Response.json({ error: message }, { status: 500 });
  }
}
