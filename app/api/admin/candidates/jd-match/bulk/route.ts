import { z } from "zod";

import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { runJdMatchForCandidate, type JdMatchRunResult } from "@/lib/candidates/jd-match";

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

const CONCURRENCY = 5;

type BulkResult = { id: string } & JdMatchRunResult;

/**
 * Bulk JD-match trigger (CV9X7R Phase 5). Unlike `POST .../candidates/pipeline`,
 * this does NOT wrap the batch in one transaction: `runJdMatchForCandidate`
 * already acquires its own per-row CAS lock and commits its own transaction,
 * so one candidate's failure must not roll back the others. Runs in capped
 * batches (not all at once) to bound concurrent LLM calls.
 */
export async function POST(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const { ids } = parsed.data;
  const uniqueIds = [...new Set(ids)];

  const results: BulkResult[] = [];
  for (let i = 0; i < uniqueIds.length; i += CONCURRENCY) {
    const chunk = uniqueIds.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (id) => ({ id, ...(await runJdMatchForCandidate(id)) })),
    );
    results.push(...chunkResults);
  }

  return Response.json({ results });
}
