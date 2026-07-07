import { requireHrForRequest } from "@/lib/admin/require-staff-request";

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

  const { data, error } = await auth.supabase
    .from("chapters")
    .update({ name })
    .eq("id", id)
    .select("id, name")
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
  if (!data) {
    return Response.json({ error: "Chapter not found." }, { status: 404 });
  }

  return Response.json({ chapter: data });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return Response.json({ error: "Invalid chapter id." }, { status: 400 });
  }

  const { error } = await auth.supabase.from("chapters").delete().eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
