import { z } from "zod";

import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requireJobViewForApplication } from "@/lib/authz/require-application-job-view";
import {
  createCandidateNote,
  getCandidateNoteById,
  listCandidateNotesByCampaignApplied,
  updateCandidateNoteBody,
  type CandidateNoteRow,
} from "@/lib/db/candidate-notes";
import { getPool } from "@/lib/db/config/client";
import { getUsersByIds } from "@/lib/db/users";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

const postBodySchema = z.object({ body: z.string().trim().min(2) }).strict();
const patchBodySchema = z
  .object({ noteId: z.string().uuid(), body: z.string().trim().min(2) })
  .strict();

async function serializeNotes(notes: CandidateNoteRow[]) {
  const authorIds = [...new Set(notes.map((n) => n.author_id).filter((id): id is string => !!id))];
  const authors = authorIds.length > 0 ? await getUsersByIds(getPool(), authorIds) : [];
  const usernameById = new Map(authors.map((a) => [a.id, a.username]));

  return notes.map((n) => ({
    id: n.id,
    body: n.body,
    created_at: n.created_at,
    updated_at: n.updated_at,
    author_id: n.author_id,
    author_username: n.author_id ? (usernameById.get(n.author_id) ?? null) : null,
  }));
}

/** Interview notes for this application, oldest first (matches the pre-migration route's order). */
export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId || !UUID_RE.test(campaignAppliedId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const appAccess = await requireJobViewForApplication(
    auth.access,
    campaignAppliedId,
  );
  if (!appAccess.ok) return appAccess.response;

  const notes = await listCandidateNotesByCampaignApplied(getPool(), campaignAppliedId, "interview");
  notes.reverse();

  return Response.json({ notes: await serializeNotes(notes) });
}

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId || !UUID_RE.test(campaignAppliedId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const appAccess = await requireJobViewForApplication(
    auth.access,
    campaignAppliedId,
  );
  if (!appAccess.ok) return appAccess.response;

  const parsed = postBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Enter a note with at least a couple of characters." }, { status: 400 });
  }

  const note = await createCandidateNote(getPool(), {
    campaignAppliedId,
    type: "interview",
    body: parsed.data.body,
    authorId: auth.userId,
  });

  const [serialized] = await serializeNotes([note]);
  return Response.json({ note: serialized }, { status: 201 });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId || !UUID_RE.test(campaignAppliedId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const appAccess = await requireJobViewForApplication(
    auth.access,
    campaignAppliedId,
  );
  if (!appAccess.ok) return appAccess.response;

  const parsed = patchBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Enter a note with at least a couple of characters." }, { status: 400 });
  }

  const db = getPool();
  const existing = await getCandidateNoteById(db, parsed.data.noteId);
  if (
    !existing ||
    existing.campaign_applied_id !== campaignAppliedId ||
    existing.type !== "interview" ||
    existing.deleted_at
  ) {
    return Response.json({ error: "Note not found." }, { status: 404 });
  }

  const canEdit = auth.access.isAdmin || existing.author_id === auth.userId;
  if (!canEdit) {
    return Response.json({ error: "You can only edit your own notes." }, { status: 403 });
  }

  const updated = await updateCandidateNoteBody(db, parsed.data.noteId, parsed.data.body);
  if (!updated) {
    return Response.json({ error: "Note not found." }, { status: 404 });
  }

  const [serialized] = await serializeNotes([updated]);
  return Response.json({ note: serialized });
}
