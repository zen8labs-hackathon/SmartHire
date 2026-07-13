import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { createChapter } from "@/lib/db/chapters";
import { getPool } from "@/lib/db/config/client";
import { isUniqueViolation } from "@/lib/db/query-helpers";

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
