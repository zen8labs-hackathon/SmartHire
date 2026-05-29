import type { CandidateDbRow } from "@/lib/candidates/db-row";

export const CANDIDATES_REALTIME_DEBOUNCE_MS = 400;

/** Normalized Supabase Realtime `postgres_changes` payload for `candidates`. */
export type CandidatesRealtimeChange = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
};

export function candidateIdFromRealtimePayload(
  payload: CandidatesRealtimeChange,
): string | null {
  const id =
    (payload.new?.id as string | undefined) ??
    (payload.old?.id as string | undefined);
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** True when list row should include `job_openings` embed but Realtime row lacks it. */
export function candidateListRowNeedsJobOpeningHydrate(row: CandidateDbRow): boolean {
  if (!row.job_opening_id) return false;
  const embed = row.job_openings;
  if (embed == null) return true;
  if (Array.isArray(embed)) return embed.length === 0;
  return false;
}

/**
 * Merges a Realtime row into an existing list row, keeping `parsed_payload` and
 * `job_openings` from the client when Realtime does not send them.
 */
export function mergeRealtimeIntoCandidateListRow(
  existing: CandidateDbRow | undefined,
  incoming: Record<string, unknown>,
): CandidateDbRow {
  const merged = {
    ...(existing ?? {}),
    ...incoming,
  } as CandidateDbRow;

  if (existing?.parsed_payload !== undefined) {
    merged.parsed_payload = existing.parsed_payload;
  }

  const embed = incoming.job_openings;
  if (embed == null || embed === undefined) {
    merged.job_openings = existing?.job_openings ?? null;
  }

  return merged;
}

function isActiveListCandidate(row: Record<string, unknown>): boolean {
  return row.is_active !== false;
}

/**
 * Applies one Realtime event to the in-memory HR candidate list.
 * Inactive rows are removed; active INSERT/UPDATE upsert by id.
 */
export function applyCandidatesRealtimeChange(
  rows: readonly CandidateDbRow[],
  payload: CandidatesRealtimeChange,
): CandidateDbRow[] {
  const id = candidateIdFromRealtimePayload(payload);
  if (!id) return [...rows];

  if (payload.eventType === "DELETE") {
    return rows.filter((r) => r.id !== id);
  }

  const next = payload.new;
  if (!next) return [...rows];

  if (!isActiveListCandidate(next)) {
    return rows.filter((r) => r.id !== id);
  }

  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) {
    return [mergeRealtimeIntoCandidateListRow(undefined, next), ...rows];
  }

  const copy = [...rows];
  copy[idx] = mergeRealtimeIntoCandidateListRow(rows[idx], next);
  return copy;
}

/** Applies a batch of Realtime events in order. */
export function applyCandidatesRealtimeBatch(
  rows: readonly CandidateDbRow[],
  batch: readonly CandidatesRealtimeChange[],
): CandidateDbRow[] {
  return batch.reduce<CandidateDbRow[]>(
    (acc, event) => applyCandidatesRealtimeChange(acc, event),
    [...rows],
  );
}

export function collectJobOpeningHydrateIds(rows: readonly CandidateDbRow[]): string[] {
  const ids: string[] = [];
  for (const r of rows) {
    if (candidateListRowNeedsJobOpeningHydrate(r)) ids.push(r.id);
  }
  return ids;
}
