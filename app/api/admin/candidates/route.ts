import { z } from "zod";

import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { softDeleteAllCampaignAppliedForCandidates } from "@/lib/db/campaign-applied";
import { listCandidatePool, softDeleteCandidates } from "@/lib/db/candidates";
import { getPool, withTransaction } from "@/lib/db/config/client";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_BULK_DELETE = 200;

const deleteBodySchema = z
  .object({
    id: z.string().uuid().optional(),
    ids: z.array(z.string().uuid()).optional(),
  })
  .refine((v) => Boolean(v.id) || (v.ids != null && v.ids.length > 0), {
    message: "Provide a candidate id or a non-empty ids array.",
  });

function parsePositiveInt(raw: string | null): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return undefined;
  return n;
}

function parseDateParam(raw: string | null): string | undefined {
  if (raw == null || raw === "") return undefined;
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return s;
}

export async function GET(request: Request) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);

  const limitRaw = parsePositiveInt(url.searchParams.get("limit"));
  const limit =
    limitRaw == null
      ? DEFAULT_LIMIT
      : Math.min(Math.max(1, limitRaw), MAX_LIMIT);
  const offset = parsePositiveInt(url.searchParams.get("offset")) ?? 0;
  const q = url.searchParams.get("q")?.trim() || undefined;
  const uploadFrom = parseDateParam(url.searchParams.get("uploadFrom"));
  const uploadTo = parseDateParam(url.searchParams.get("uploadTo"));

  try {
    const result = await listCandidatePool(getPool(), {
      q,
      limit,
      offset,
      uploadFrom,
      uploadTo,
    });
    return Response.json({
      candidates: result.rows,
      pagination: {
        limit: result.limit,
        offset: result.offset,
        total: result.total,
        experiencedTotal: result.experiencedTotal,
        hasMore: result.offset + result.rows.length < result.total,
      },
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load candidates.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = deleteBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }

  const ids = [
    ...new Set([
      ...(parsed.data.ids ?? []),
      ...(parsed.data.id ? [parsed.data.id] : []),
    ]),
  ];
  if (ids.length > MAX_BULK_DELETE) {
    return Response.json(
      {
        error: `Cannot delete more than ${MAX_BULK_DELETE} candidates at once.`,
      },
      { status: 400 },
    );
  }

  try {
    const { deletedCandidateIds, deletedApplicationCount } =
      await withTransaction(async (tx) => {
        const apps = await softDeleteAllCampaignAppliedForCandidates(tx, ids);
        const people = await softDeleteCandidates(tx, ids);
        return {
          deletedCandidateIds: people.map((p) => p.id),
          deletedApplicationCount: apps.length,
        };
      });

    return Response.json({ deletedCandidateIds, deletedApplicationCount });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to delete candidates.";
    return Response.json({ error: message }, { status: 500 });
  }
}
