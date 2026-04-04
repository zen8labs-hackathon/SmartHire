import { requireHrForRequest } from "@/lib/admin/require-staff-request";

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

  const { data, error } = await auth.supabase
    .from("chapters")
    .insert({ name })
    .select("id, name, created_at")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { error: "A chapter with this name already exists." },
        { status: 409 },
      );
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ chapter: data }, { status: 201 });
}
