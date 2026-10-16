import {
  requireHrForRequest,
  requireStaffForRequest,
} from "@/lib/admin/require-staff-request";
import { requireCanCreateJobs } from "@/lib/authz/require-permission";
import { getPool } from "@/lib/db/config/client";
import { isUniqueViolation } from "@/lib/db/query-helpers";
import { createPipeline, PipelineWriteError } from "@/lib/db/pipelines";
import { getPipelineLibrary, getPipelines } from "@/lib/pipelines/get-pipelines";
import { createPipelineSchema } from "@/lib/pipelines/schemas";

export async function GET(request: Request) {
  // HR and chapter heads (who pick a pipeline when opening a position).
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const perm = requireCanCreateJobs(auth.access);
  if (!perm.ok) return perm.response;

  const db = getPool();
  const [pipelines, library] = await Promise.all([getPipelines(db), getPipelineLibrary(db)]);
  return Response.json({ pipelines, library });
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
  const parsed = createPipelineSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed." },
      { status: 400 },
    );
  }

  try {
    const id = await createPipeline({ ...parsed.data, userId: auth.userId });
    const pipeline = (await getPipelines(getPool())).find((p) => p.id === id) ?? null;
    return Response.json({ pipeline }, { status: 201 });
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
    const message = err instanceof Error ? err.message : "Could not create pipeline.";
    return Response.json({ error: message }, { status: 500 });
  }
}
