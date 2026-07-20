import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { getPool } from "@/lib/db/config/client";
import { isUniqueViolation } from "@/lib/db/query-helpers";
import { softDeletePipelineStage, updatePipelineStage } from "@/lib/db/pipeline-stages";
import { pipelineStageSchema } from "@/lib/pipelines/schemas";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return Response.json({ error: "Invalid stage ID." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = pipelineStageSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed." },
      { status: 400 },
    );
  }

  const { code, label, desc, color } = parsed.data;

  try {
    const stage = await updatePipelineStage(getPool(), id, { code, label, desc, color });
    if (!stage) {
      return Response.json({ error: "Stage not found or already deleted." }, { status: 404 });
    }
    return Response.json({ stage });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return Response.json(
        { error: `A stage with code '${code}' already exists.` },
        { status: 409 },
      );
    }
    const message = err instanceof Error ? err.message : "Could not update stage.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return Response.json({ error: "Invalid stage ID." }, { status: 400 });
  }

  const stage = await softDeletePipelineStage(getPool(), id);
  if (!stage) {
    return Response.json({ error: "Stage not found or already deleted." }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
