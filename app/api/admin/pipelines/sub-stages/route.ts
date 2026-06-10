import { requireHrForRequest } from "@/lib/admin/require-staff-request";
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

  const { data, error } = await auth.supabase
    .from("pipeline_sub_stages")
    .select("id, pipeline_stage_id, code, label, sequence_number, is_default, is_passed, created_at")
    .eq("pipeline_stage_id", stageId)
    .is("deleted_at", null)
    .order("sequence_number", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ subStages: data });
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

  // Insert the sub-stage
  const { data, error } = await auth.supabase
    .from("pipeline_sub_stages")
    .insert({ pipeline_stage_id, code, label, sequence_number, is_default, is_passed })
    .select("id, pipeline_stage_id, code, label, sequence_number, is_default, is_passed, created_at")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { error: `A sub-stage with code '${code}' already exists in this stage.` },
        { status: 409 },
      );
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ subStage: data }, { status: 201 });
}
