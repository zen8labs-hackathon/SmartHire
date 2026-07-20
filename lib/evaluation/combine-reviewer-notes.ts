import type { QueryExecutor } from "@/lib/db/config/client";
import { listCandidateNotesByCampaignApplied } from "@/lib/db/candidate-notes";
import { getUsersByIds } from "@/lib/db/users";

/** Pre-interview planning + saved interview notes for the evaluation AI prompt. */
export function combinePreAndInterviewNotes(
  preInterviewNote: string,
  interviewNotesAggregated: string,
): string {
  const pre = preInterviewNote.trim();
  const post = interviewNotesAggregated.trim();
  const preBlock = pre
    ? `=== Pre-interview (planned questions / topics) ===\n${pre}`
    : "";
  if (preBlock && post) return `${preBlock}\n\n---\n\n${post}`;
  return preBlock || post;
}

/**
 * Loads all interview notes for an application and formats them for the
 * evaluation AI prompt, oldest first. `candidate_notes` has no per-author
 * profile join built in, so author usernames are resolved separately (same
 * pattern as the interview-notes route's `serializeNotes`).
 */
async function loadInterviewNotesAggregatedText(
  db: QueryExecutor,
  campaignAppliedId: string,
): Promise<string> {
  const notes = await listCandidateNotesByCampaignApplied(
    db,
    campaignAppliedId,
    "interview",
  );
  if (notes.length === 0) return "";

  const authorIds = [
    ...new Set(
      notes.map((n) => n.author_id).filter((id): id is string => !!id),
    ),
  ];
  const authors = authorIds.length > 0 ? await getUsersByIds(db, authorIds) : [];
  const usernameById = new Map(authors.map((a) => [a.id, a.username]));

  return [...notes]
    .reverse() // query orders newest-first; the prompt reads best oldest-first
    .map((n) => {
      const when = n.created_at.toISOString().slice(0, 16).replace("T", " ");
      const who = n.author_id
        ? (usernameById.get(n.author_id) ?? n.author_id.slice(0, 8))
        : "Unknown";
      return `[${when} @${who}]\n${n.body}`;
    })
    .join("\n\n---\n\n");
}

/** Most recent `pre_interview`-type note body, matching the pre-interview-note route's "one note per application" contract. */
async function loadPreInterviewNoteText(
  db: QueryExecutor,
  campaignAppliedId: string,
): Promise<string> {
  const [note] = await listCandidateNotesByCampaignApplied(
    db,
    campaignAppliedId,
    "pre_interview",
  );
  return note?.body?.trim() ?? "";
}

export async function loadCombinedReviewerNotesForEvaluation(
  db: QueryExecutor,
  campaignAppliedId: string,
): Promise<string> {
  const [pre, interview] = await Promise.all([
    loadPreInterviewNoteText(db, campaignAppliedId),
    loadInterviewNotesAggregatedText(db, campaignAppliedId),
  ]);
  return combinePreAndInterviewNotes(pre, interview);
}
