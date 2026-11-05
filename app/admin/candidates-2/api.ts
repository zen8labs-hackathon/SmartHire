import type { CandApp, Cv, CvUse, Person } from "./types";

/** The UI keys people by number; the API uses uuids. `uuidById` maps the surrogate back. */
export type LoadedCandidates = {
  people: Person[];
  uuidById: Map<number, string>;
  total: number;
  counts: { all: number; applying: number };
  facets: { roles: string[]; tags: string[] };
};

export type CandidateListQuery = {
  q?: string;
  tab?: "all" | "applying";
  role?: string;
  tag?: string;
  expMin?: number;
  expMax?: number;
  rehire?: "eligible" | "ask" | "not_eligible" | "unset";
  apps?: "1" | "2+";
  sortBy?: "updated" | "name" | "exp" | "created";
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

/** Row shape of GET /api/admin/candidates-2 (listCandidates2). */
export type CandidateApiRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  degree: string | null;
  education: string | null;
  role: string | null;
  experience_years: string | null;
  skills: string[] | null;
  tags: string[] | null;
  rehire_status: "eligible" | "ask" | "not_eligible" | null;
  created_at: string | null;
  updated_at: string | null;
  app_count: number;
  has_open: boolean;
  latest: {
    id: string;
    job_id: string;
    title: string | null;
    stage: string | null;
    sub: string | null;
    result: "open" | "ended" | "hired";
    score: number | null;
    score_status: string | null;
    created_at: string | null;
  } | null;
};

function ddmmyyyy(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    return ((await res.json()) as { error?: string }).error ?? fallback;
  } catch {
    return fallback;
  }
}

/** AI match bands: >=80 strong, >=65 good, >=50 partial, else weak. */
export function scoreBand(score: number): string {
  if (score >= 80) return "Strong fit";
  if (score >= 65) return "Good fit";
  if (score >= 50) return "Partial fit";
  return "Weak fit";
}

function latestToApp(l: NonNullable<CandidateApiRow["latest"]>): CandApp {
  const status = l.score_status;
  const scoring = status === "pending" || status === "processing";
  const scoreErr = status === "failed" || status === "error";
  const app: CandApp = {
    id: l.id,
    job: null,
    title: l.title ?? "Untitled position",
    chapter: null,
    jobStatus: null,
    date: ddmmyyyy(l.created_at),
    stage: l.stage ?? "—",
    sub: l.sub ?? "",
    result: l.result,
  };
  if (scoring) app.scoring = true;
  else if (scoreErr) app.scoreErr = true;
  else if (l.score != null) {
    app.score = l.score;
    app.band = scoreBand(l.score);
  }
  return app;
}

/** List-level mapper: identity, tags, rehire and the latest application. Detail fields arrive in later phases. */
export function candidateToPerson(c: CandidateApiRow, id: number): Person {
  const exp = Number(c.experience_years ?? 0);
  return {
    id,
    name: c.name ?? "—",
    email: c.email ?? "",
    phone: c.phone ?? "",
    role: c.role ?? "",
    exp: Number.isFinite(exp) ? exp : 0,
    skills: c.skills ?? [],
    degree: c.degree ?? "",
    education: c.education ?? "",
    english: "",
    dob: "",
    company: "",
    source: "",
    created: ddmmyyyy(c.created_at),
    updated: ddmmyyyy(c.updated_at),
    apps: c.latest ? [latestToApp(c.latest)] : [],
    appCount: c.app_count,
    cvs: [],
    tags: c.tags ?? [],
    log: [],
    rehire: c.rehire_status
      ? { v: c.rehire_status === "not_eligible" ? "no" : c.rehire_status, reason: "", by: "", at: "" }
      : { v: null },
    remind: null,
    consent: { date: "", via: "" },
  };
}

export async function fetchCandidates(
  opts: CandidateListQuery = {},
  signal?: AbortSignal,
): Promise<LoadedCandidates> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(opts)) {
    if (v !== undefined && v !== "") params.set(k, String(v));
  }
  const res = await fetch(`/api/admin/candidates-2?${params}`, { signal });
  if (!res.ok) throw new Error(await readError(res, "Could not load candidates."));
  const body = (await res.json()) as {
    candidates?: CandidateApiRow[];
    counts?: { all: number; applying: number };
    facets?: { roles: string[]; tags: string[] };
    pagination?: { total?: number };
  };
  const rows = body.candidates ?? [];
  const uuidById = new Map<number, string>();
  const people = rows.map((r, i) => {
    const id = (opts.offset ?? 0) + i + 1;
    uuidById.set(id, r.id);
    return candidateToPerson(r, id);
  });
  return {
    people,
    uuidById,
    total: body.pagination?.total ?? people.length,
    counts: body.counts ?? { all: people.length, applying: 0 },
    facets: body.facets ?? { roles: [], tags: [] },
  };
}

/** Response of GET /api/admin/candidates-2/[id]. */
export type CandidateDetailResponse = {
  candidate: CandidateApiRow & {
    rehire_reason: string | null;
    rehire_by: string | null;
    rehire_by_name?: string | null;
    rehire_at: string | null;
    consent_date: string | null;
    consent_channel: string | null;
    consent_recorded_by: string | null;
    english_level: string | null;
    date_of_birth: string | null;
    source: string | null;
    source_other: string | null;
  };
  applications: {
    id: string;
    job_id: string | null;
    title: string | null;
    job_status: string | null;
    stage: string | null;
    sub: string | null;
    hired_at: string | null;
    ended_at: string | null;
    end_reason: string | null;
    end_note: string | null;
    score: number | null;
    score_status: string | null;
    active_cv_version_id: string | null;
    created_at: string | null;
  }[];
  timeline?: { id: string; campaign_applied_id: string | null; type: string; title: string; detail: string | null; by_name: string | null; at: string }[];
  cooldownApplicationId?: string | null;
  expState?: {
    manual: { years: number; by: string | null; at: string; reason: string | null } | null;
    ai: number | null;
    conflict: { years: number; file: string } | null;
    latestParsed: number | null;
  };
  cvs: {
    id: string;
    campaign_applied_id: string;
    version_number: number;
    source_event: string;
    cv_storage_path: string | null;
    original_filename: string | null;
    cv_file_sha256: string | null;
    parsing_status: string | null;
    parsing_error: string | null;
    matched_on: string | null;
    change_summary: string | null;
    created_by: string | null;
    created_at: string;
  }[];
};

const SOURCE_EVENT_LABEL: Record<string, string> = {
  initial_upload: "Initial upload",
  file_replaced: "File replaced",
  manual_edit: "Manual edit",
  restore: "Restored version",
};

function appResult(a: CandidateDetailResponse["applications"][number]): CandApp["result"] {
  if (a.hired_at) return "hired";
  if (a.ended_at) return "ended";
  return "open";
}

export function cvDownloadUrl(candidateUuid: string, versionId: string): string {
  return `/api/admin/candidates-2/${candidateUuid}/cv-download?versionId=${encodeURIComponent(versionId)}`;
}

/** Detail mapper. CV files are grouped by storage path so one file used by several applications shows once. */
export function candidateDetailToPerson(d: CandidateDetailResponse, id: number): Person {
  const base = candidateToPerson({ ...d.candidate, app_count: d.applications.length, has_open: false, latest: null }, id);
  const c = d.candidate;
  const activeIds = new Set(d.applications.map((a) => a.active_cv_version_id).filter(Boolean));

  const apps: CandApp[] = d.applications.map((a) => {
    const status = a.score_status;
    const app: CandApp = {
      id: a.id,
      job: null,
      title: a.title ?? "Untitled position",
      chapter: null,
      jobStatus: a.job_status,
      date: ddmmyyyy(a.created_at),
      stage: a.stage ?? "—",
      sub: a.sub ?? "",
      result: appResult(a),
    };
    if (status === "pending" || status === "processing") app.scoring = true;
    else if (status === "failed" || status === "error") app.scoreErr = true;
    else if (a.score != null) {
      app.score = a.score;
      app.band = scoreBand(a.score);
    }
    if (a.ended_at) {
      app.end = ddmmyyyy(a.ended_at);
      if (a.end_reason) app.rk = a.end_reason;
      if (a.end_note) app.reason = a.end_note;
    }
    return app;
  });

  const groups = new Map<string, Cv>();
  for (const v of d.cvs) {
    const key = v.cv_storage_path ?? `v${v.id}`;
    const use: CvUse = {
      app: v.campaign_applied_id,
      v: v.version_number,
      inUse: activeIds.has(v.id),
      note: SOURCE_EVENT_LABEL[v.source_event] ?? v.source_event,
    };
    const existing = groups.get(key);
    if (existing) {
      existing.uses.push(use);
      continue;
    }
    groups.set(key, {
      id: v.id,
      file: v.original_filename ?? "CV",
      date: ddmmyyyy(v.created_at),
      by: v.created_by ?? "System",
      batch: SOURCE_EVENT_LABEL[v.source_event] ?? v.source_event,
      source: c.source === "Other" && c.source_other ? c.source_other : (c.source ?? ""),
      matched: v.matched_on ?? "—",
      status: v.parsing_status === "failed" ? "failed" : "parsed",
      error: v.parsing_error ?? undefined,
      change: v.change_summary ?? undefined,
      uses: [use],
    });
  }
  const cvs = [...groups.values()];
  if (cvs[0]) cvs[0].latest = true;

  const es = d.expState;
  const expFields: Pick<Person, "exp" | "edits" | "conflict"> = {
    exp: es?.manual ? es.manual.years : base.exp,
    ...(es?.manual && es.ai != null
      ? { edits: { exp: { ai: es.ai, by: es.manual.by ?? "HR", at: ddmmyyyy(es.manual.at), reason: es.manual.reason ?? "" } } }
      : {}),
    conflict: es?.conflict ? { field: "exp", cv: es.conflict.years, file: es.conflict.file } : null,
  };

  return {
    ...base,
    ...expFields,
    uuid: c.id,
    english: c.english_level ?? "Not found in CV",
    dob: ddmmyyyy(c.date_of_birth) || "Not found in CV",
    source: c.source === "Other" && c.source_other ? c.source_other : (c.source ?? ""),
    cooldownApp: d.cooldownApplicationId ?? null,
    log: (d.timeline ?? []).map((t) => ({
      d: ddmmyyyy(t.at),
      type: "record",
      icon: t.type === "rehire" ? "user-check" : t.type === "reason" ? "check" : "clock",
      title: t.title,
      sub: [t.by_name, t.detail].filter(Boolean).join(" · ") || undefined,
      app: t.campaign_applied_id ?? undefined,
    })),
    apps,
    appCount: apps.length,
    cvs,
    rehire: c.rehire_status
      ? {
          v: c.rehire_status === "not_eligible" ? "no" : c.rehire_status,
          reason: c.rehire_reason ?? "",
          by: c.rehire_by_name ?? "",
          at: ddmmyyyy(c.rehire_at),
        }
      : { v: null },
    consent: {
      date: ddmmyyyy(c.consent_date),
      via: [c.consent_channel, c.consent_recorded_by && `recorded by ${c.consent_recorded_by}`].filter(Boolean).join(", "),
    },
  };
}

export async function fetchCandidate(uuid: string, id: number, signal?: AbortSignal): Promise<Person> {
  const res = await fetch(`/api/admin/candidates-2/${uuid}`, { signal });
  if (!res.ok) throw new Error(await readError(res, "Could not load candidate."));
  return candidateDetailToPerson((await res.json()) as CandidateDetailResponse, id);
}

export async function updateContact(
  uuid: string,
  id: number,
  v: { email: string; phone: string },
): Promise<Person> {
  const res = await fetch(`/api/admin/candidates-2/${uuid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(v),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not update contact."));
  return candidateDetailToPerson((await res.json()) as CandidateDetailResponse, id);
}

/** Upload a CV to an application id or "pool", then kick off parsing (fire-and-forget). */
export async function uploadCv(
  uuid: string,
  id: number,
  v: { file: File; target: string; source?: string; sourceOther?: string },
): Promise<Person> {
  const fd = new FormData();
  fd.set("file", v.file);
  fd.set("target", v.target);
  if (v.source) fd.set("source", v.source);
  if (v.sourceOther) fd.set("sourceOther", v.sourceOther);
  const res = await fetch(`/api/admin/candidates-2/${uuid}/cv`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(await readError(res, "Could not upload CV."));
  const body = (await res.json()) as CandidateDetailResponse & { applicationId?: string };
  if (body.applicationId) {
    void fetch(`/api/admin/candidates/${body.applicationId}/process`, { method: "POST" }).catch(() => {});
  }
  return candidateDetailToPerson(body, id);
}

/** Set the experience value through a manual-edit CV version ("use CV value" / "revert to AI"). */
export async function setExperience(
  uuid: string,
  id: number,
  v: { applicationId: string; years: number; summary: string },
): Promise<Person> {
  const res = await fetch(`/api/admin/candidates-2/${uuid}/experience`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(v),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not update experience."));
  const body = (await res.json()) as CandidateDetailResponse & { applicationId?: string; rescore?: boolean };
  if (body.rescore && body.applicationId) {
    void fetch(`/api/admin/candidates/${body.applicationId}/process`, { method: "POST" }).catch(() => {});
  }
  return candidateDetailToPerson(body, id);
}

/** Queue an AI JD-match re-run for one application (BR-08-08). */
export async function rescoreApplication(uuid: string, applicationId: string): Promise<void> {
  const res = await fetch(`/api/admin/candidates-2/${uuid}/rescore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ applicationId }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not re-score."));
}

/** Download the profile PDF (no internal notes) and hand it to the browser as a file save. */
export async function exportProfile(uuid: string): Promise<void> {
  const res = await fetch(`/api/admin/candidates-2/${uuid}/export`);
  if (!res.ok) throw new Error(await readError(res, "Could not export the profile."));
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "profile.pdf";
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type CvCompareSide = {
  id: string;
  file: string;
  createdAt: string;
  role: string | null;
  experienceYears: string | null;
  skills: string[];
  english: string | null;
  education: string | null;
};

/** Parsed fields of two CV versions of one candidate (UC-03-03). */
export async function compareCvs(uuid: string, a: string, b: string): Promise<{ a: CvCompareSide; b: CvCompareSide }> {
  const res = await fetch(`/api/admin/candidates-2/${uuid}/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
  if (!res.ok) throw new Error(await readError(res, "Could not compare CVs."));
  return res.json();
}

/** Set rehire eligibility; the server writes the "Rehire set to: …" timeline event. */
export async function setRehire(uuid: string, id: number, v: { status: "eligible" | "ask" | "not_eligible"; reason: string }): Promise<Person> {
  const res = await fetch(`/api/admin/candidates-2/${uuid}/rehire`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(v),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not save rehire eligibility."));
  return candidateDetailToPerson((await res.json()) as CandidateDetailResponse, id);
}

/** Record why an ended application ended. */
export async function endApplication(uuid: string, id: number, v: { applicationId: string; reason: string; note: string }): Promise<Person> {
  const res = await fetch(`/api/admin/candidates-2/${uuid}/reject`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(v),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not save reason."));
  return candidateDetailToPerson((await res.json()) as CandidateDetailResponse, id);
}
