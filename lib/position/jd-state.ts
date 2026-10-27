import type { JobRow } from "@/lib/db/jobs";

/**
 * "Draft" is not a `jobs.status` value (the CHECK constraint is untouched): a
 * Draft is a `Pending` job whose `update_note` starts with this marker.
 * Opening or putting the job on hold strips it.
 */
export const DRAFT_MARKER = "[Draft]";
/** SQL predicate (alias `j`) matching Draft rows; keep in sync with `isDraft`. */
export const DRAFT_SQL = `(j.status = 'Pending' AND j.update_note LIKE '[Draft]%')`;

/** Written after the Draft marker when background JD extraction fails. */
export const JD_FAILED_PREFIX = "JD extraction failed: ";
const FAILED_MARKER = `${DRAFT_MARKER} ${JD_FAILED_PREFIX}`;

export function isDraft(job: Pick<JobRow, "status" | "update_note">): boolean {
  return job.status === "Pending" && !!job.update_note?.startsWith(DRAFT_MARKER);
}

export function draftNote(text?: string): string {
  return text ? `${DRAFT_MARKER} ${text}` : DRAFT_MARKER;
}

/** User-visible part of a Draft's note. */
export function plainNote(note: string | null): string | null {
  if (note == null) return null;
  const t = note.startsWith(DRAFT_MARKER) ? note.slice(DRAFT_MARKER.length).trim() : note;
  return t || null;
}

/** A Draft whose extraction has produced nothing after this long is treated as failed. */
export const JD_PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;

export type JdState = {
  state: "processing" | "failed" | "done" | null;
  error: string | null;
};

type JdStateInput = Pick<
  JobRow,
  | "status"
  | "jd_storage_path"
  | "update_note"
  | "role_overview"
  | "duties_and_responsibilities"
  | "experience_requirements_must_have"
  | "updated_at"
>;

export function failureNote(message: string): string {
  return `${FAILED_MARKER}${message}`.slice(0, 500);
}

const filled = (v: string | null | undefined) => !!v && v.trim().length > 0;

/**
 * Derives JD processing state from existing columns (no dedicated columns):
 * - failed: failure marker in `update_note`, or no result within the timeout
 * - done: extracted body fields are present
 * - processing: Draft with an uploaded JD and nothing extracted yet
 */
export function deriveJdState(job: JdStateInput, now = new Date()): JdState {
  if (!isDraft(job) || !job.jd_storage_path) {
    return { state: null, error: null };
  }
  if (job.update_note?.startsWith(FAILED_MARKER)) {
    return {
      state: "failed",
      error: job.update_note.slice(FAILED_MARKER.length) || "JD processing failed",
    };
  }
  if (
    filled(job.role_overview) ||
    filled(job.duties_and_responsibilities) ||
    filled(job.experience_requirements_must_have)
  ) {
    return { state: "done", error: null };
  }
  if (now.getTime() - job.updated_at.getTime() > JD_PROCESSING_TIMEOUT_MS) {
    return { state: "failed", error: "JD processing timed out. Retry." };
  }
  return { state: "processing", error: null };
}
