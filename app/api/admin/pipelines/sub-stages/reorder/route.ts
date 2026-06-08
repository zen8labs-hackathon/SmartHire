import { requireHrForRequest } from "@/lib/admin/require-staff-request";

export async function POST(request: Request) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const payload = body as { reorders?: { id: string; sequence_number: number }[] };
  const reorders = payload.reorders;

  if (!reorders || !Array.isArray(reorders)) {
    return Response.json({ error: "Invalid or missing reorders array." }, { status: 400 });
  }

  // Update sequence numbers in parallel
  const promises = reorders.map(({ id, sequence_number }) =>
    auth.supabase
      .from("pipeline_sub_stages")
      .update({ sequence_number })
      .eq("id", id),
  );

  const results = await Promise.all(promises);
  const failedResult = results.find((r) => r.error);

  if (failedResult?.error) {
    return Response.json({ error: failedResult.error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
