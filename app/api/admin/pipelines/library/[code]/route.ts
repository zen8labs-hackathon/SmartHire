import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import {
  countUpcomingActiveSchedulesForStage,
  upcomingInterviewsBlockMessage,
} from "@/lib/db/candidate-schedules";
import { getPool } from "@/lib/db/config/client";
import { isUniqueViolation } from "@/lib/db/query-helpers";
import { deleteLibraryStage, LibraryError, saveLibraryStage } from "@/lib/db/pipeline-library";
import { getPipelineLibrary } from "@/lib/pipelines/get-pipelines";
import { libraryStageBodySchema } from "@/lib/pipelines/schemas";
import { toLibraryInput } from "../to-input";

type RouteContext = { params: Promise<{ code: string }> };

function libraryErrorResponse(err: unknown, fallback: string) {
  if (err instanceof LibraryError) {
    return Response.json({ error: err.message }, { status: err.code === "NOT_FOUND" ? 404 : 409 });
  }
  if (isUniqueViolation(err)) {
    return Response.json({ error: "Step names must be unique" }, { status: 409 });
  }
  return Response.json({ error: err instanceof Error ? err.message : fallback }, { status: 500 });
}

/** Updates a library stage and reconciles its steps (matched by code). */
export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;
  const { code } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = libraryStageBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Validation failed." }, { status: 400 });
  }
  try {
    // BR-INT-13: the Schedule flag cannot be turned off while interviews are upcoming.
    if (parsed.data.type !== "schedule") {
      const current = (await getPipelineLibrary(getPool())).find((s) => s.id === code);
      if (current?.type === "schedule") {
        const upcoming = await countUpcomingActiveSchedulesForStage(getPool(), { code });
        if (upcoming > 0) {
          return Response.json({ error: upcomingInterviewsBlockMessage(upcoming) }, { status: 409 });
        }
      }
    }
    await saveLibraryStage(toLibraryInput(parsed.data, code), false);
    const stage = (await getPipelineLibrary(getPool())).find((s) => s.id === code);
    return Response.json({ stage });
  } catch (err) {
    return libraryErrorResponse(err, "Could not update stage.");
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;
  const { code } = await params;
  try {
    await deleteLibraryStage(code);
    return new Response(null, { status: 204 });
  } catch (err) {
    return libraryErrorResponse(err, "Could not delete stage.");
  }
}
