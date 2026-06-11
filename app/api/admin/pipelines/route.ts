import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { pipelineStageSchema } from "@/lib/pipelines/schemas";

export async function GET(request: Request) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("pipeline_stages")
    .select("id, code, label, desc, color, created_at, updated_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ stages: data });
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

  // Insert the stage. We handle unique constraint conflict on code (active ones).
  const { data, error } = await auth.supabase
    .from("pipeline_stages")
    .insert({ code, label, desc, color })
    .select("id, code, label, desc, color, created_at, updated_at")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { error: `A stage with code '${code}' already exists.` },
        { status: 409 },
      );
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ stage: data }, { status: 201 });
}
