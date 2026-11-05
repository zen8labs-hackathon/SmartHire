import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { getPool } from "@/lib/db/config/client";
import { getCandidate2Detail } from "@/lib/db/candidates-detail2";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const detail = await getCandidate2Detail(getPool(), id);
    if (!detail) return Response.json({ error: "Not found." }, { status: 404 });
    return Response.json(detail);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load candidate.";
    return Response.json({ error: message }, { status: 500 });
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  let body: { email?: unknown; phone?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim() : undefined;
  const phone = typeof body.phone === "string" ? body.phone.trim() : undefined;
  if (email === undefined && phone === undefined) {
    return Response.json({ error: "Nothing to update." }, { status: 400 });
  }
  if (email && !EMAIL_RE.test(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (email !== undefined && !email && phone === undefined) {
    return Response.json({ error: "Email cannot be empty." }, { status: 400 });
  }

  try {
    const db = getPool();
    const { rows: dup } = await db.query(
      `SELECT id FROM candidates
        WHERE id <> $1 AND deleted_at IS NULL
          AND (($2::text IS NOT NULL AND $2 <> '' AND lower(email) = lower($2))
            OR ($3::text IS NOT NULL AND $3 <> '' AND phone = $3))
        LIMIT 1`,
      [id, email ?? null, phone ?? null],
    );
    if (dup.length) {
      return Response.json(
        { error: "Another candidate already uses this email or phone." },
        { status: 409 },
      );
    }
    const { rowCount } = await db.query(
      `UPDATE candidates
          SET email = COALESCE($2, email), phone = COALESCE($3, phone), updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL`,
      [id, email ?? null, phone ?? null],
    );
    if (!rowCount) return Response.json({ error: "Not found." }, { status: 404 });
    const detail = await getCandidate2Detail(db, id);
    return Response.json(detail);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update candidate.";
    return Response.json({ error: message }, { status: 500 });
  }
}
