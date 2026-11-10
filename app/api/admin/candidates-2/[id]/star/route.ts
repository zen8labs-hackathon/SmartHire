import { z } from "zod";

import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { getPool } from "@/lib/db/config/client";
import { logApiError } from "@/lib/logger";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  starred: z.boolean(),
}).strict();

export async function PUT(
  request: Request,
  { params }: RouteContext,
) {

  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return Response.json(
      { error: "Invalid candidate ID." },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "starred must be a boolean." },
      { status: 400 },
    );
  }

  try {
    const { rows } = await getPool().query<{
      id: string;
      is_starred: boolean;
    }>(
      `UPDATE candidates
       SET is_starred = $2
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, is_starred`,
      [id, parsed.data.starred],
    );

    const candidate = rows[0];

    if (!candidate) {
      return Response.json(
        { error: "Candidate not found." },
        { status: 404 },
      );
    }

    return Response.json({
      id: candidate.id,
      starred: candidate.is_starred,
    });
  } catch (error) {
    logApiError("Candidate star: PUT failed", error, {
      candidateId: id,
    });

    return Response.json(
      { error: "Failed to save candidate star." },
      { status: 500 },
    );
  }
}
