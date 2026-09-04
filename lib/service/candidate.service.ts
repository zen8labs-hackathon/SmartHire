import type { CandidatesListPagination } from "@/lib/candidates/candidates-list-query";
import type { JdPipelineApplicationRow } from "@/lib/candidates/campaign-applied-table-row";

/*
Client-side only service for interacting with the candidates API endpoints
 */

/** One row of the cross-job pool list (`GET /api/admin/candidates`) -- the
 * `candidates` table row as it arrives over JSON (timestamps as ISO strings). */
export type GroupedCandidateRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  degree: string | null;
  education: string | null;
  role: string | null;
  experience_years: string | null;
  skills: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/** One of a candidate's applications (`GET .../profile/:id/campaign-applied`),
 * a `campaign_applied` row joined with its job's title/created-at and its
 * raw current stage/sub-stage, as it arrives over JSON (timestamps as ISO
 * strings). `job_id === null` is an unassigned / pool application --
 * `job_title`/`job_created_at` are then also `null`. `stage_*`/`sub_stage_*`
 * are a raw join (no fallback): also `null` for an application that has
 * never been explicitly moved yet, even when its job has a pipeline --
 * `current_job_stage_mapping_id`/`current_sub_state_id` start `null` on
 * every new application by design (see `assignJobToCampaignApplied`'s doc
 * comment on the backend). */
export type CandidateApplicationRow = {
  id: string;
  candidate_id: string;
  job_id: string | null;
  job_title: string | null;
  job_created_at: string | null;
  active_cv_version_id: string | null;
  current_job_stage_mapping_id: string | null;
  current_sub_state_id: string | null;
  source: string;
  source_other: string | null;
  expected_salary: string | null;
  jd_match_score: number | null;
  jd_match_status: string;
  jd_match_error: string | null;
  jd_match_rationale: string | null;
  hired_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  stage_code: string | null;
  stage_label: string | null;
  stage_color: string | null;
  sub_stage_code: string | null;
  sub_stage_label: string | null;
  sub_stage_is_passed: boolean | null;
};

/** An existing candidate that already owns the submitted email/phone, from
 * `POST .../profile/:candidateId/check-duplicate`. `matchedOn` says which
 * signal(s) matched. A merge folds the *current* candidate's CV into this one
 * (this record survives -- it holds the established identity). */
export type CandidateDedupeMatch = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  matchedOn: "email" | "phone" | "email_or_phone";
};

export const candidateService = {
  // GET /admin/job-descriptions/:id/candidates?<queryParams> -- paginated,
  // filtered candidate list for one job's pipeline table (search, stage
  // filter, sort, pagination)
  getFilteredCandidateList: async (
    jobId: string,
    queryParams: Record<string, string>,
  ): Promise<{
    candidates: JdPipelineApplicationRow[];
    pagination: CandidatesListPagination | null;
  }> => {
    const params = new URLSearchParams(queryParams);
    const res = await fetch(
      `/api/admin/job-descriptions/${jobId}/candidates?${params}`,
      { credentials: "include", cache: "no-store" },
    );
    if (!res.ok) {
      throw new Error("Could not load candidate list.");
    }
    const json = (await res.json()) as {
      candidates?: JdPipelineApplicationRow[];
      pagination?: CandidatesListPagination | null;
    };
    return {
      candidates: json.candidates ?? [],
      pagination: json.pagination ?? null,
    };
  },

  // GET /api/admin/candidates?<queryParams> -- paginated, free-text-filtered
  // pool list: one row per person, straight from the `candidates` table (no
  // per-application data). Backs the cross-job `/admin/candidates` page.
  getGroupedCandidatesList: async (
    queryParams: Record<string, string> = {},
  ): Promise<{
    candidates: GroupedCandidateRow[];
    pagination: CandidatesListPagination | null;
  }> => {
    const params = new URLSearchParams(queryParams);
    const res = await fetch(`/api/admin/candidates?${params}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error("Could not load candidate list.");
    }
    const json = (await res.json()) as {
      candidates?: GroupedCandidateRow[];
      pagination?: CandidatesListPagination | null;
    };
    return {
      candidates: json.candidates ?? [],
      pagination: json.pagination ?? null,
    };
  },

  // POST /admin/job-descriptions/:id/candidates/rerun-ai-matching -- enqueues a
  // `rerun-ai-matching` queue job per candidate (re-download CV -> re-parse ->
  // re-score). `errorIds` are candidates with no processed CV to re-run.
  rerunAIMatching: async (
    jobId: string,
    candidateIds: string[],
  ): Promise<{
    candidates: { candidateId: string }[];
    errorIds: string[];
  }> => {
    const res = await fetch(
      `/api/admin/job-descriptions/${jobId}/candidates/rerun-ai-matching`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      candidates?: { candidateId: string }[];
      errorIds?: string[];
    };
    if (!res.ok) {
      throw new Error(json.error ?? "Could not rerun AI matching.");
    }
    return { candidates: json.candidates ?? [], errorIds: json.errorIds ?? [] };
  },

  deleteCandidatesByJobId: async (
    jobId: string,
    candidateIds: string[],
  ): Promise<void> => {},

  // GET /api/admin/candidates/profile/:candidateId -- one candidate's profile
  // row from the `candidates` table (no application / CV data).
  getCandidateById: async (
    candidateId: string,
  ): Promise<GroupedCandidateRow> => {
    const res = await fetch(
      `/api/admin/candidates/profile/${encodeURIComponent(candidateId)}`,
      { credentials: "include", cache: "no-store" },
    );
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      candidate?: GroupedCandidateRow;
    };
    if (!res.ok || !json.candidate) {
      throw new Error(json.error ?? "Could not load candidate.");
    }
    return json.candidate;
  },

  // PATCH /api/admin/candidates/profile/:candidateId -- update one candidate's
  // profile fields on the `candidates` table. Omitted fields stay untouched;
  // `null` clears a column.
  updateCandidate: async (
    candidateId: string,
    patch: Partial<{
      name: string | null;
      email: string | null;
      phone: string | null;
      degree: string | null;
      education: string | null;
      role: string | null;
      experienceYears: number | null;
      skills: string[];
    }>,
  ): Promise<GroupedCandidateRow> => {
    const res = await fetch(
      `/api/admin/candidates/profile/${encodeURIComponent(candidateId)}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      candidate?: GroupedCandidateRow;
    };
    if (!res.ok || !json.candidate) {
      throw new Error(json.error ?? "Could not update candidate.");
    }
    return json.candidate;
  },

  // DELETE /api/admin/candidates -- person-scope soft delete (single or bulk).
  // Soft-deletes the `candidates` rows and all their `campaign_applied` rows.
  deleteCandidates: async (
    candidateIds: string[],
  ): Promise<{
    deletedCandidateIds: string[];
    deletedApplicationCount: number;
  }> => {
    const res = await fetch(`/api/admin/candidates`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: candidateIds }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      deletedCandidateIds?: string[];
      deletedApplicationCount?: number;
    };
    if (!res.ok) {
      throw new Error(json.error ?? "Could not delete candidates.");
    }
    return {
      deletedCandidateIds: json.deletedCandidateIds ?? [],
      deletedApplicationCount: json.deletedApplicationCount ?? 0,
    };
  },

  // GET /api/admin/candidates/profile/:candidateId/campaign-applied --
  // paginated list of a candidate's applications (one per job, plus any
  // unassigned/pool application), newest first, excluding soft-deleted rows.
  getCandidateApplications: async (
    candidateId: string,
    queryParams: Record<string, string> = {},
  ): Promise<{
    applications: CandidateApplicationRow[];
    pagination: CandidatesListPagination | null;
  }> => {
    const params = new URLSearchParams(queryParams);
    const res = await fetch(
      `/api/admin/candidates/profile/${encodeURIComponent(
        candidateId,
      )}/campaign-applied?${params}`,
      { credentials: "include", cache: "no-store" },
    );
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      applications?: CandidateApplicationRow[];
      pagination?: CandidatesListPagination | null;
    };
    if (!res.ok) {
      throw new Error(json.error ?? "Could not load candidate applications.");
    }
    return {
      applications: json.applications ?? [],
      pagination: json.pagination ?? null,
    };
  },

  // GET /api/admin/candidates/profile/:candidateId/campaign-applied/:applicationId/expected-salary
  getExpectedSalary: async (
    candidateId: string,
    applicationId: string,
  ): Promise<{ expectedSalary: string | null; canView: boolean }> => {
    const res = await fetch(
      `/api/admin/candidates/profile/${encodeURIComponent(
        candidateId,
      )}/campaign-applied/${encodeURIComponent(applicationId)}/expected-salary`,
      { credentials: "include", cache: "no-store" },
    );
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      expectedSalary?: string | null;
      canView?: boolean;
    };
    if (!res.ok) {
      throw new Error(json.error ?? "Could not load expected salary.");
    }
    return {
      expectedSalary: json.expectedSalary ?? null,
      canView: json.canView === true,
    };
  },

  // PATCH .../campaign-applied/:applicationId/expected-salary
  updateExpectedSalary: async (
    candidateId: string,
    applicationId: string,
    expectedSalary: string | null,
  ): Promise<{ expectedSalary: string | null; canView: boolean }> => {
    const res = await fetch(
      `/api/admin/candidates/profile/${encodeURIComponent(
        candidateId,
      )}/campaign-applied/${encodeURIComponent(applicationId)}/expected-salary`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedSalary }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      expectedSalary?: string | null;
      canView?: boolean;
    };
    if (!res.ok) {
      throw new Error(json.error ?? "Could not update expected salary.");
    }
    return {
      expectedSalary: json.expectedSalary ?? null,
      canView: json.canView === true,
    };
  },

  // POST /api/admin/candidates/manual/check-duplicate -- pre-create dedupe
  // check for the manual-entry form (no candidate exists yet, so there is no
  // id to exclude).
  checkDuplicateForNewCandidate: async (contact: {
    email?: string | null;
    phone?: string | null;
  }): Promise<{ duplicates: CandidateDedupeMatch[] }> => {
    const res = await fetch(`/api/admin/candidates/manual/check-duplicate`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contact),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      duplicates?: CandidateDedupeMatch[];
    };
    if (!res.ok) {
      throw new Error(
        json.error ?? "Could not check for duplicate candidates.",
      );
    }
    return { duplicates: json.duplicates ?? [] };
  },

  // POST /api/admin/candidates/profile/:candidateId/check-duplicate
  checkDuplicateCandidate: async (
    candidateId: string,
    contact: { email?: string | null; phone?: string | null } = {},
  ): Promise<{
    duplicates: CandidateDedupeMatch[];
    currentCvVersionId: string | null;
  }> => {
    const res = await fetch(
      `/api/admin/candidates/profile/${encodeURIComponent(candidateId)}/check-duplicate`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contact),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      duplicates?: CandidateDedupeMatch[];
      currentCvVersionId?: string | null;
    };
    if (!res.ok) {
      throw new Error(
        json.error ?? "Could not check for duplicate candidates.",
      );
    }
    return {
      duplicates: json.duplicates ?? [],
      currentCvVersionId: json.currentCvVersionId ?? null,
    };
  },

  // POST /api/admin/candidates/profile/:candidateId/deduplicate
  deduplicateCandidate: async (
    candidateId: string,
    cvVersionId: string,
    patch?: Partial<{
      name: string | null;
      email: string | null;
      phone: string | null;
      degree: string | null;
      education: string | null;
      role: string | null;
      experienceYears: number | null;
      skills: string[];
    }>,
  ): Promise<{
    candidate: GroupedCandidateRow | null;
    canonicalCandidateId: string;
    duplicateCandidateId: string;
    duplicateCandidateDeleted: boolean;
    targetCampaignAppliedId: string;
    mergedCvVersionId: string;
    sourceDisposition: "moved" | "soft_deleted" | "kept";
  }> => {
    const res = await fetch(
      `/api/admin/candidates/profile/${encodeURIComponent(candidateId)}/deduplicate`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch ? { cvVersionId, patch } : { cvVersionId }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      candidate?: GroupedCandidateRow | null;
      canonicalCandidateId?: string;
      duplicateCandidateId?: string;
      duplicateCandidateDeleted?: boolean;
      targetCampaignAppliedId?: string;
      mergedCvVersionId?: string;
      sourceDisposition?: "moved" | "soft_deleted" | "kept";
    };
    if (!res.ok) {
      throw new Error(json.error ?? "Could not merge duplicate candidate.");
    }
    return {
      candidate: json.candidate ?? null,
      canonicalCandidateId: json.canonicalCandidateId ?? candidateId,
      duplicateCandidateId: json.duplicateCandidateId ?? "",
      duplicateCandidateDeleted: json.duplicateCandidateDeleted ?? false,
      targetCampaignAppliedId: json.targetCampaignAppliedId ?? "",
      mergedCvVersionId: json.mergedCvVersionId ?? "",
      sourceDisposition: json.sourceDisposition ?? "kept",
    };
  },
};
