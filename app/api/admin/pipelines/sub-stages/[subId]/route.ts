import { z } from "zod";
import { requireHrForRequest } from "@/lib/admin/require-staff-request";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ subId: string }> };

const patchSubStageSchema = z.object({
  code: z
    .string()
    .min(1, "Code is required")
    .max(50, "Code must be at most 50 characters")
    .regex(
      /^[a-z0-9_]+$/,
      "Code must contain only lowercase letters, numbers, and underscores (no spaces)",
    ),
  label: z
    .string()
    .min(1, "Label is required")
    .max(100, "Label must be at most 100 characters"),
  sequence_number: z
    .number()
    .int("Sequence number must be an integer")
    .min(1, "Sequence number must be at least 1"),
  is_default: z.boolean().optional(),
  is_passed: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { subId } = await params;
  if (!subId || !UUID_RE.test(subId)) {
    return Response.json({ error: "Invalid sub-stage ID." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = patchSubStageSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed." },
      { status: 400 },
    );
  }

  const { code, label, sequence_number, is_default, is_passed } = parsed.data;

  const { data, error } = await auth.supabase
    .from("pipeline_sub_stages")
    .update({ code, label, sequence_number, is_default, is_passed })
    .eq("id", subId)
    .is("deleted_at", null)
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

  if (!data) {
    return Response.json(
      { error: "Sub-stage not found or already deleted." },
      { status: 404 },
    );
  }

  return Response.json({ subStage: data });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { subId } = await params;
  if (!subId || !UUID_RE.test(subId)) {
    return Response.json({ error: "Invalid sub-stage ID." }, { status: 400 });
  }

  // Soft delete: update deleted_at
  const { data, error } = await auth.supabase
    .from("pipeline_sub_stages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", subId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return Response.json(
      { error: "Sub-stage not found or already deleted." },
      { status: 404 },
    );
  }

  return new Response(null, { status: 204 });
}
