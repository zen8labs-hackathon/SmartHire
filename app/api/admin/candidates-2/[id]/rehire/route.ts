import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { getCandidate2Detail } from "@/lib/db/candidates-detail2";
import { REHIRE_LABEL, REHIRE_STATUSES, type RehireStatus } from "@/lib/candidates/cooldown";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Set rehire eligibility (UC-06). Body: { status, reason }. "not_eligible"
 * needs a reason. Writes the "Rehire set to: …" timeline event. Never blocks
 * adding the candidate to a position.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  let body: { status?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const status = body.status as RehireStatus;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
  if (!REHIRE_STATUSES.includes(status)) {
    return Response.json({ error: "Choose a rehire status." }, { status: 400 });
  }
  if (status === "not_eligible" && !reason) {
    return Response.json({ error: "A reason is required for Not eligible." }, { status: 400 });
  }

  try {
    const db = getPool();
    const updated = await withTransaction(async (tx) => {
      const { rows } = await tx.query(
        `UPDATE candidates
            SET rehire_status = $2, rehire_reason = $3, rehire_by = $4, rehire_at = now()
          WHERE id = $1 AND deleted_at IS NULL
          RETURNING id`,
        [id, status, reason || null, auth.userId ?? null],
      );
      if (!rows.length) return false;
      await tx.query(
        `INSERT INTO candidate_timeline_events (candidate_id, type, title, detail, by_user_id)
         VALUES ($1, 'rehire', $2, $3, $4)`,
        [id, `Rehire set to: ${REHIRE_LABEL[status]}`, reason || null, auth.userId ?? null],
      );
      return true;
    });
    if (!updated) return Response.json({ error: "Not found." }, { status: 404 });
    return Response.json(await getCandidate2Detail(db, id));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save rehire eligibility.";
    return Response.json({ error: message }, { status: 500 });
  }
}
