import { requireHrForRequest } from "@/lib/admin/require-staff-request";
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

  const { code, label, desc } = parsed.data;

  const { data, error } = await auth.supabase
    .from("pipeline_stages")
    .update({ code, label, desc })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, code, label, desc, created_at, updated_at")
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

  if (!data) {
    return Response.json({ error: "Stage not found or already deleted." }, { status: 404 });
  }

  return Response.json({ stage: data });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return Response.json({ error: "Invalid stage ID." }, { status: 400 });
  }

  // Soft delete: update deleted_at
  const { data, error } = await auth.supabase
    .from("pipeline_stages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return Response.json({ error: "Stage not found or already deleted." }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
