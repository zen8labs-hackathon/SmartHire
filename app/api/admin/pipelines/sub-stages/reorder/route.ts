import { z } from "zod";
import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { withTransaction } from "@/lib/db/config/client";
import { updatePipelineSubStage } from "@/lib/db/pipeline-stages";

const reorderBodySchema = z.object({
  reorders: z
    .array(
      z.object({
        id: z.string().uuid(),
        sequence_number: z.number().int().min(1),
      }),
    )
    .min(1),
});

export async function POST(request: Request) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = reorderBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid or missing reorders array." },
      { status: 400 },
    );
  }

  try {
    await withTransaction(async (db) => {
      for (const { id, sequence_number } of parsed.data.reorders) {
        await updatePipelineSubStage(db, id, { sequenceNumber: sequence_number });
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reorder sub-stages.";
    return Response.json({ error: message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
