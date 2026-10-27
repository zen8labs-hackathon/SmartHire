import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { getPool } from "@/lib/db/config/client";
import { isUniqueViolation } from "@/lib/db/query-helpers";
import { PipelineWriteError, softDeletePipeline, updatePipeline } from "@/lib/db/pipelines";
import { getPipelines } from "@/lib/pipelines/get-pipelines";
import { updatePipelineSchema } from "@/lib/pipelines/schemas";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ pipelineId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { pipelineId } = await params;
  if (!UUID_RE.test(pipelineId)) {
    return Response.json({ error: "Invalid pipeline ID." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = updatePipelineSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed." },
      { status: 400 },
    );
  }

  try {
    const ok = await updatePipeline(pipelineId, { ...parsed.data, userId: auth.userId });
    if (!ok) {
      return Response.json({ error: "Pipeline not found or already deleted." }, { status: 404 });
    }
    const pipeline = (await getPipelines(getPool())).find((p) => p.id === pipelineId) ?? null;
    return Response.json({ pipeline });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return Response.json(
        { error: `A pipeline named '${parsed.data.name}' already exists.` },
        { status: 409 },
      );
    }
    if (err instanceof PipelineWriteError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Could not update pipeline.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { pipelineId } = await params;
  if (!UUID_RE.test(pipelineId)) {
    return Response.json({ error: "Invalid pipeline ID." }, { status: 400 });
  }

  const ok = await softDeletePipeline(getPool(), pipelineId, auth.userId);
  if (!ok) {
    return Response.json({ error: "Pipeline not found or already deleted." }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
