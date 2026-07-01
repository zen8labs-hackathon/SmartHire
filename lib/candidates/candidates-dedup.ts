import type { SupabaseClient } from "@supabase/supabase-js";

import { parsedContactFromPayload } from "@/lib/candidates/duplicate-detection";
import { ADMIN_CANDIDATES_SELECT } from "@/lib/candidates/admin-select";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import { enrichCandidatesWithJobOpenings } from "@/lib/candidates/enrich-candidates-job-openings";
import type { CandidatesListPagination } from "@/lib/candidates/candidates-list-query";

const DEDUP_FETCH_LIMIT = 5000;

function skillsUnion(groups: (string[] | null)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const skillList of groups) {
    for (const s of skillList ?? []) {
      const key = s.trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        result.push(s.trim());
      }
    }
  }
  return result;
}

function maxExpYears(rows: CandidateDbRow[]): number {
  let max = 0;
  for (const r of rows) {
    const v = r.experience_years;
    const n = v == null || v === "" ? 0 : Number(v);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

function personKey(row: CandidateDbRow): string {
  const contact = parsedContactFromPayload(row.parsed_payload);
  if (contact.email) return `email:${contact.email}`;
  if (contact.phoneVariants.length > 0) return `phone:${contact.phoneVariants[0]}`;
  return `anon:${row.id}`;
}

export type DedupedCandidatesResult = {
  people: CandidateDbRow[];
  pagination: CandidatesListPagination;
  error: string | null;
};

export async function queryDedupedCandidatesList(
  supabase: SupabaseClient,
  input: {
    q?: string;
    uploadFrom?: string;
    uploadTo?: string;
    limit?: number;
    offset?: number;
  },
): Promise<DedupedCandidatesResult> {
  const limit = Math.min(Math.max(1, input.limit ?? 50), 200);
  const offset = input.offset ?? 0;

  const emptyPagination: CandidatesListPagination = {
    limit,
    offset,
    total: 0,
    hasMore: false,
  };

  const { data, error } = await supabase
    .from("candidates")
    .select(ADMIN_CANDIDATES_SELECT)
    .eq("is_active", true)
    .order("cv_uploaded_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(DEDUP_FETCH_LIMIT);

  if (error) {
    return { people: [], pagination: emptyPagination, error: error.message };
  }

  const raw = (data ?? []) as unknown as CandidateDbRow[];
  const enriched = await enrichCandidatesWithJobOpenings(supabase, raw);

  // Group by person identity; enriched is already sorted most-recent-first
  const groups = new Map<string, CandidateDbRow[]>();
  const keyOrder: string[] = [];

  for (const row of enriched) {
    const key = personKey(row);
    if (!groups.has(key)) {
      groups.set(key, []);
      keyOrder.push(key);
    }
    groups.get(key)!.push(row);
  }

  // Merge each group → one row per person (base = most recent)
  let merged: CandidateDbRow[] = keyOrder.map((key) => {
    const group = groups.get(key)!;
    const base = group[0];
    return {
      ...base,
      experience_years: maxExpYears(group),
      skills: skillsUnion(group.map((r) => r.skills)),
    };
  });

  // Apply search filter against merged row fields
  if (input.q) {
    const lower = input.q.toLowerCase();
    merged = merged.filter(
      (r) =>
        r.name?.toLowerCase().includes(lower) ||
        r.role?.toLowerCase().includes(lower) ||
        r.school?.toLowerCase().includes(lower) ||
        r.degree?.toLowerCase().includes(lower) ||
        r.original_filename?.toLowerCase().includes(lower),
    );
  }

  // Apply upload date filter against most recent CV date
  if (input.uploadFrom || input.uploadTo) {
    const fromMs = input.uploadFrom
      ? new Date(`${input.uploadFrom}T00:00:00.000Z`).getTime()
      : null;
    const toEndMs = input.uploadTo
      ? (() => {
          const d = new Date(`${input.uploadTo}T00:00:00.000Z`);
          d.setUTCDate(d.getUTCDate() + 1);
          return d.getTime();
        })()
      : null;
    merged = merged.filter((r) => {
      const t = r.cv_uploaded_at ? new Date(r.cv_uploaded_at).getTime() : null;
      if (t == null) return false;
      if (fromMs != null && t < fromMs) return false;
      if (toEndMs != null && t >= toEndMs) return false;
      return true;
    });
  }

  const total = merged.length;
  const page = merged.slice(offset, offset + limit);

  return {
    people: page,
    pagination: { limit, offset, total, hasMore: offset + page.length < total },
    error: null,
  };
}
