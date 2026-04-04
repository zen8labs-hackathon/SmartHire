import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { verifyPipelineCandidateForJd } from "@/lib/jd/verify-pipeline-candidate-jd";

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

  const ok = await verifyPipelineCandidateForJd(admin, jdId, pc.data);
  if (!ok) {
    return Response.json({ error: "Candidate not found for this job." }, { status: 404 });
  }

  const { data, error } = await admin
    .from("pipeline_candidate_pre_interview_notes")
    .select("pre_interview_note, updated_at")
    .eq("job_description_id", jdId)
    .eq("pipeline_candidate_id", pc.data)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const row = data as { pre_interview_note: string; updated_at: string } | null;
  return Response.json({
    preInterviewNote: row?.pre_interview_note ?? "",
    updatedAt: row?.updated_at ?? null,
  });
}

const putBodySchema = z.object({
  pipelineCandidateId: z.string().uuid(),
  preInterviewNote: z.string().max(32_000),
});

export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const jdId = parseJdId(id);
  if (!jdId) {
    return Response.json({ error: "Invalid job description id." }, { status: 400 });
  }

  let body: z.infer<typeof putBodySchema>;
  try {
    body = putBodySchema.parse(await request.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.message : "Invalid JSON body.";
    return Response.json({ error: msg }, { status: 400 });
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

  const ok = await verifyPipelineCandidateForJd(admin, jdId, body.pipelineCandidateId);
  if (!ok) {
    return Response.json({ error: "Candidate not found for this job." }, { status: 404 });
  }

  const note = body.preInterviewNote.trim();
  const now = new Date().toISOString();

  const { error } = await admin.from("pipeline_candidate_pre_interview_notes").upsert(
    {
      job_description_id: jdId,
      pipeline_candidate_id: body.pipelineCandidateId,
      pre_interview_note: note,
      updated_at: now,
      updated_by: auth.userId,
    },
    { onConflict: "job_description_id,pipeline_candidate_id" },
  );

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, preInterviewNote: note, updatedAt: now });
}
