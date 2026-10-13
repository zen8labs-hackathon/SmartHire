import { requireHrForRequest, requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { createChapter, listChapters } from "@/lib/db/chapters";
import { getPool } from "@/lib/db/config/client";
import { isUniqueViolation } from "@/lib/db/query-helpers";

export async function GET(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  try {
    const rows = await listChapters(getPool());
    return Response.json({
      chapters: rows.map((c) => ({ id: c.id, name: c.name })),
      headedChapterIds: auth.access.headedChapterIds,
      isHr: auth.access.isHr,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load chapters.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

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
    const chapter = await createChapter(getPool(), name);
    return Response.json({ chapter }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return Response.json(
        { error: "A chapter with this name already exists." },
        { status: 409 },
      );
    }
    const message = err instanceof Error ? err.message : "Could not create chapter.";
    return Response.json({ error: message }, { status: 500 });
  }
}
