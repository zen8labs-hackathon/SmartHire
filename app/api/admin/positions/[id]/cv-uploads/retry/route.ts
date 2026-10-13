import { getPool } from "@/lib/db/config/client";
import { retryScopedUploads } from "@/lib/position/cv-upload-actions";
import { guardPositionUpload } from "@/lib/position/cv-upload-guard";

type Ctx = { params: Promise<{ id: string }> };

/** Re-queues failed/stuck uploads of this position (or the pool). Body `{ ids }`. */
export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guardPositionUpload(request, id);
  if (!g.ok) return g.response;
  let body: { ids?: unknown };
  try {
    body = (await request.json()) as { ids?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
  const res = await retryScopedUploads(getPool(), ids, g.jobId);
  if (!res.ok) return Response.json({ error: res.error }, { status: 400 });
  return Response.json({ results: res.results });
}
