import { z } from "zod";
import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { getPool } from "@/lib/db/config/client";
import { isUniqueViolation } from "@/lib/db/query-helpers";
import { softDeletePipelineSubStage, updatePipelineSubStage } from "@/lib/db/pipeline-stages";

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

  try {
    const subStage = await updatePipelineSubStage(getPool(), subId, {
      code,
      label,
      sequenceNumber: sequence_number,
      isDefault: is_default,
      isPassed: is_passed,
    });
    if (!subStage) {
      return Response.json(
        { error: "Sub-stage not found or already deleted." },
        { status: 404 },
      );
    }
    return Response.json({ subStage });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return Response.json(
        { error: `A sub-stage with code '${code}' already exists in this stage.` },
        { status: 409 },
      );
    }
    const message = err instanceof Error ? err.message : "Could not update sub-stage.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { subId } = await params;
  if (!subId || !UUID_RE.test(subId)) {
    return Response.json({ error: "Invalid sub-stage ID." }, { status: 400 });
  }

  const subStage = await softDeletePipelineSubStage(getPool(), subId);
  if (!subStage) {
    return Response.json(
      { error: "Sub-stage not found or already deleted." },
      { status: 404 },
    );
  }

  return new Response(null, { status: 204 });
}
