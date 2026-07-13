import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { deleteChapter, updateChapterName } from "@/lib/db/chapters";
import { getPool } from "@/lib/db/config/client";
import { isUniqueViolation } from "@/lib/db/query-helpers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return Response.json({ error: "Invalid chapter id." }, { status: 400 });
  }

  let body: { name?: string };
  try {
    body = (await request.json()) as { name?: string };
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (!name) {
    return Response.json({ error: "Chapter name is required." }, { status: 400 });
  }
  if (name.length > 120) {
    return Response.json(
      { error: "Chapter name must be at most 120 characters." },
      { status: 400 },
    );
  }

  try {
    const chapter = await updateChapterName(getPool(), id, name);
    if (!chapter) {
      return Response.json({ error: "Chapter not found." }, { status: 404 });
    }
    return Response.json({ chapter });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return Response.json(
        { error: "A chapter with this name already exists." },
        { status: 409 },
      );
    }
    const message = err instanceof Error ? err.message : "Could not update chapter.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return Response.json({ error: "Invalid chapter id." }, { status: 400 });
  }

  try {
    await deleteChapter(getPool(), id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not delete chapter.";
    return Response.json({ error: message }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
