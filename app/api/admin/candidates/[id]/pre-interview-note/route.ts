import { z } from "zod";

import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import {
  createCandidateNote,
  listCandidateNotesByCampaignApplied,
  updateCandidateNoteBody,
} from "@/lib/db/candidate-notes";
import { getPool } from "@/lib/db/config/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

const putBodySchema = z.object({ preInterviewNote: z.string() }).strict();

/**
 * `candidate_notes` has no unique-per-application constraint for a given
 * type (it's a list table), unlike the old `pipeline_candidate_pre_interview_notes`
 * upsert-to-single-row table it replaces. The UI only ever shows one
 * pre-interview note per application, so this route reproduces that contract
 * on top of the list: "the note" is always the most recently created
 * `pre_interview`-type note, updated in place rather than appended to.
 */
async function getExistingNote(campaignAppliedId: string) {
  const [note] = await listCandidateNotesByCampaignApplied(
    getPool(),
    campaignAppliedId,
    "pre_interview",
  );
  return note ?? null;
}

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId || !UUID_RE.test(campaignAppliedId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const note = await getExistingNote(campaignAppliedId);
  return Response.json({ preInterviewNote: note?.body ?? "" });
}

export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId || !UUID_RE.test(campaignAppliedId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const parsed = putBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const existing = await getExistingNote(campaignAppliedId);
  const saved = existing
    ? await updateCandidateNoteBody(getPool(), existing.id, parsed.data.preInterviewNote)
    : await createCandidateNote(getPool(), {
        campaignAppliedId,
        type: "pre_interview",
        body: parsed.data.preInterviewNote,
        authorId: auth.userId,
      });

  return Response.json({ preInterviewNote: saved?.body ?? "" });
}
