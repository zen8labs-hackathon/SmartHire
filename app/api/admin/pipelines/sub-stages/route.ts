import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { getPool } from "@/lib/db/config/client";
import { isUniqueViolation } from "@/lib/db/query-helpers";
import { createPipelineSubStage, listPipelineSubStages } from "@/lib/db/pipeline-stages";
import { pipelineSubStageSchema } from "@/lib/pipelines/schemas";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const stageId = url.searchParams.get("stageId");
  if (!stageId || !UUID_RE.test(stageId)) {
    return Response.json({ error: "Invalid or missing stageId parameter." }, { status: 400 });
  }

  const subStages = await listPipelineSubStages(getPool(), stageId);
  return Response.json({ subStages });
}

export async function POST(request: Request) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = pipelineSubStageSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed." },
      { status: 400 },
    );
  }

  const { pipeline_stage_id, code, label, sequence_number, is_default, is_passed } = parsed.data;

  try {
    const subStage = await createPipelineSubStage(getPool(), {
      pipelineStageId: pipeline_stage_id,
      code,
      label,
      sequenceNumber: sequence_number,
      isDefault: is_default,
      isPassed: is_passed,
    });
    return Response.json({ subStage }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return Response.json(
        { error: `A sub-stage with code '${code}' already exists in this stage.` },
        { status: 409 },
      );
    }
    const message = err instanceof Error ? err.message : "Could not create sub-stage.";
    return Response.json({ error: message }, { status: 500 });
  }
}
