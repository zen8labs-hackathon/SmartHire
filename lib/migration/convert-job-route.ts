import { z } from "zod";

import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionOnJob } from "@/lib/authz/require-permission";
import { invalidJson, readJson } from "@/lib/calendar/validation";
import { ConversionError } from "@/lib/migration/convert-job";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ID = z.string().regex(/^\d{1,19}$/, "Invalid ID");

export const conversionBodySchema = z
  .object({
    pipelineId: z.string().regex(UUID_RE, "Invalid pipeline ID"),
    pairs: z
      .array(
        z.object({
          oldMappingId: z.string().regex(UUID_RE, "Invalid mapping ID"),
          pipelineRowId: z.string().regex(UUID_RE, "Invalid pipeline row ID"),
        }),
      )
      .max(100),
    probationStageId: z.string().regex(UUID_RE, "Invalid stage ID").nullable().optional(),
    data: z
      .object({
        hireType: z.enum(["New hire", "Replacement"]).optional(),
        officeScheduleIds: z.array(ID).max(5000).optional(),
        evaluationChoices: z
          .record(ID, z.object({ scheduleId: ID, profileId: z.string().regex(UUID_RE, "Invalid profile ID") }).nullable())
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type RouteContext = { params: Promise<{ id: string }> };

type Guarded<B> = { userId: string; jobId: string; body: B };

/** Shared guard: staff auth, UUID job id, `migration.manage` on that one job, optional body. */
export async function guardMigrationRequest<S extends z.ZodTypeAny>(
  request: Request,
  { params }: RouteContext,
  schema?: S,
): Promise<{ ok: true; value: Guarded<z.infer<S>> } | { ok: false; response: Response }> {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return { ok: false, response: auth.response };

  const { id: jobId } = await params;
  if (!jobId || !UUID_RE.test(jobId))
    return { ok: false, response: Response.json({ error: "Not found." }, { status: 404 }) };

  const perm = await requirePermissionOnJob(auth.access, "migration.manage", jobId);
  if (!perm.ok) return { ok: false, response: perm.response };

  let body: unknown = undefined;
  if (schema) {
    const json = await readJson(request);
    if (json === undefined) return { ok: false, response: invalidJson() };
    const parsed = schema.safeParse(json);
    if (!parsed.success)
      return {
        ok: false,
        response: Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body." }, { status: 400 }),
      };
    body = parsed.data;
  }
  return { ok: true, value: { userId: auth.userId, jobId, body: body as z.infer<S> } };
}

const STATUS: Record<ConversionError["code"], number> = {
  BLOCKED: 422,
  STALE_PLAN: 409,
  NOT_LEGACY: 409,
  JOB_NOT_FOUND: 404,
};

export function conversionErrorResponse(e: unknown): Response {
  if (e instanceof ConversionError)
    return Response.json({ error: e.message, code: e.code, plan: e.plan }, { status: STATUS[e.code] });
  throw e;
}
