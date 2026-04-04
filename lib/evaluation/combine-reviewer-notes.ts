import type { SupabaseClient } from "@supabase/supabase-js";

import { loadInterviewNotesAggregatedText } from "@/lib/evaluation/interview-notes-text";

export async function loadPreInterviewNoteText(
  admin: SupabaseClient,
  jobDescriptionId: number,
  pipelineCandidateId: string,
): Promise<string> {
  const { data, error } = await admin
    .from("pipeline_candidate_pre_interview_notes")
    .select("pre_interview_note")
    .eq("job_description_id", jobDescriptionId)
    .eq("pipeline_candidate_id", pipelineCandidateId)
    .maybeSingle();

  if (error || !data) return "";
  const raw = (data as { pre_interview_note: string | null }).pre_interview_note;
  return typeof raw === "string" ? raw.trim() : "";
}

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

export async function loadCombinedReviewerNotesForEvaluation(
  admin: SupabaseClient,
  jobDescriptionId: number,
  pipelineCandidateId: string,
): Promise<string> {
  const [pre, interview] = await Promise.all([
    loadPreInterviewNoteText(admin, jobDescriptionId, pipelineCandidateId),
    loadInterviewNotesAggregatedText(admin, jobDescriptionId, pipelineCandidateId),
  ]);
  return combinePreAndInterviewNotes(pre, interview);
}
