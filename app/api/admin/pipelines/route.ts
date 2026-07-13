import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { getPool } from "@/lib/db/config/client";
import { isUniqueViolation } from "@/lib/db/query-helpers";
import { createPipelineStage, listPipelineStages } from "@/lib/db/pipeline-stages";
import { pipelineStageSchema } from "@/lib/pipelines/schemas";

export async function GET(request: Request) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const stages = await listPipelineStages(getPool());
  return Response.json({ stages });
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

  const parsed = pipelineStageSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed." },
      { status: 400 },
    );
  }

  const { code, label, desc, color } = parsed.data;

  try {
    const stage = await createPipelineStage(getPool(), { code, label, desc, color });
    return Response.json({ stage }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return Response.json(
        { error: `A stage with code '${code}' already exists.` },
        { status: 409 },
      );
    }
    const message = err instanceof Error ? err.message : "Could not create stage.";
    return Response.json({ error: message }, { status: 500 });
  }
}
