import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffForRequest } from "@/lib/admin/require-staff-request";

type RouteContext = { params: Promise<{ id: string }> };

function parseJdId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const jdId = parseJdId(id);
  if (!jdId) {
    return Response.json({ error: "Invalid job description id." }, { status: 400 });
  }

  const url = new URL(request.url);
  const pcRaw = url.searchParams.get("pipelineCandidateId")?.trim() ?? "";
  const pc = z.string().uuid().safeParse(pcRaw);
  if (!pc.success) {
    return Response.json(
      { error: "Missing or invalid pipelineCandidateId (UUID)." },
      { status: 400 },
    );
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return Response.json(
      { error: "Server missing service role key." },
      { status: 500 },
    );
  }

  const { data: rows, error } = await admin
    .from("candidate_interview_notes")
    .select("id, body, created_at, author_id")
    .eq("job_description_id", jdId)
    .eq("pipeline_candidate_id", pc.data)
    .order("created_at", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const list = rows ?? [];
  const authorIds = [...new Set(list.map((r) => r.author_id as string))];
  const { data: profs } = await admin
    .from("profiles")
    .select("id, username")
    .in("id", authorIds);

  const uname = new Map(
    (profs ?? []).map((p) => [p.id as string, String(p.username)]),
  );

  return Response.json({
    notes: list.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.created_at,
      authorId: r.author_id,
      authorUsername: uname.get(r.author_id as string) ?? null,
    })),
  });
}

const postBodySchema = z.object({
  pipelineCandidateId: z.string().uuid(),
  body: z.string().min(1).max(32_000),
});

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const jdId = parseJdId(id);
  if (!jdId) {
    return Response.json({ error: "Invalid job description id." }, { status: 400 });
  }

  let body: z.infer<typeof postBodySchema>;
  try {
    body = postBodySchema.parse(await request.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.message : "Invalid JSON body.";
    return Response.json({ error: msg }, { status: 400 });
  }

  const { data: inserted, error } = await auth.supabase
    .from("candidate_interview_notes")
    .insert({
      job_description_id: jdId,
      pipeline_candidate_id: body.pipelineCandidateId,
      author_id: auth.userId,
      body: body.body.trim(),
    })
    .select("id, created_at")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  return Response.json({ note: inserted }, { status: 201 });
}
