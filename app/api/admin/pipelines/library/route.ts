import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { getPool } from "@/lib/db/config/client";
import { isUniqueViolation } from "@/lib/db/query-helpers";
import { saveLibraryStage } from "@/lib/db/pipeline-library";
import { getPipelineLibrary } from "@/lib/pipelines/get-pipelines";
import { createLibraryStageSchema } from "@/lib/pipelines/schemas";
import { toLibraryInput } from "./to-input";

/** Creates a library stage together with its steps. */
export async function POST(request: Request) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = createLibraryStageSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Validation failed." }, { status: 400 });
  }
  try {
    await saveLibraryStage(toLibraryInput(parsed.data, parsed.data.code), true);
    const stage = (await getPipelineLibrary(getPool())).find((s) => s.id === parsed.data.code);
    return Response.json({ stage }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return Response.json({ error: "A stage with this name already exists." }, { status: 409 });
    }
    return Response.json({ error: err instanceof Error ? err.message : "Could not create stage." }, { status: 500 });
  }
}
