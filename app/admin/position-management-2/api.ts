import type { Batch, BatchFile, Candidate, Job, Stage, TimelineItem } from "./data";
import type { PositionCandidate, PositionCandidatesResult, PositionPipelineStage } from "@/lib/position/list-position-candidates";
import type { PositionDescription } from "@/lib/position/get-position-description";
import type { PositionListResult, PositionListRow } from "@/lib/position/list-with-enrichment";

/** The UI keys jobs by number; the API uses uuids. `uuidById` maps the surrogate back. */
export type LoadedPositions = {
  jobs: Job[];
  uuidById: Map<number, string>;
  pool: { candidates: number; attention: number } | null;
};

function ddmmyyyy(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

export function positionToJob(p: PositionListRow, id: number): Job {
  return {
    id,
    title: p.title,
    chapter: p.chapters[0]?.name ?? "—",
    level: p.level ?? "—",
    type: p.type,
    status: p.status,
    headcount: p.headcount ?? 0,
    hired: p.hired,
    deadline: ddmmyyyy(p.deadline),
    daysLeft: p.daysLeft ?? undefined,
    candidates: p.candidates,
    attention: p.attention,
    owner: p.owner?.username ?? "—",
    updated: ddmmyyyy(p.updated) ?? "",
    draftNote: p.draftNote,
    processing: p.processing === "processing" ? "extract" : null,
    procError: p.processing === "failed" ? (p.processingError ?? "JD processing failed") : null,
    fresh: p.fresh,
    legacy: p.legacy,
  };
}

export async function fetchPositionDescription(uuid: string, signal?: AbortSignal): Promise<PositionDescription> {
  const res = await fetch(`/api/admin/positions/${uuid}`, { signal });
  if (!res.ok) throw new Error(`Failed to load description (${res.status})`);
  return ((await res.json()) as { description: PositionDescription }).description;
}

export async function fetchPositions(signal?: AbortSignal, idOf?: (uuid: string) => number): Promise<LoadedPositions> {
  const res = await fetch("/api/admin/positions", { signal });
  if (!res.ok) throw new Error(`Failed to load positions (${res.status})`);
  const data = (await res.json()) as PositionListResult;
  const uuidById = new Map<number, string>();
  const jobs = data.positions.map((p, i) => {
    const id = idOf ? idOf(p.id) : i + 1;
    uuidById.set(id, p.id);
    return positionToJob(p, id);
  });
  return { jobs, uuidById, pool: data.pool ?? null };
}

export type ChapterOption = { id: string; name: string };
export type ChapterInfo = { chapters: ChapterOption[]; headedChapterIds: string[]; isHr: boolean; userId?: string };

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    return ((await res.json()) as { error?: string }).error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function fetchChapters(signal?: AbortSignal): Promise<ChapterInfo> {
  const res = await fetch("/api/admin/chapters", { signal });
  if (!res.ok) throw new Error(await readError(res, "Could not load chapters."));
  return (await res.json()) as ChapterInfo;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

async function uploadJd(file: File): Promise<{ path: string }> {
  const sign = await fetch("/api/admin/job-openings/sign-upload", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ filename: file.name, mimeType: file.type || null }),
  });
  if (!sign.ok) throw new Error(await readError(sign, "Could not start upload."));
  const { path, signedUrl } = (await sign.json()) as { path?: string; signedUrl?: string };
  if (!path || !signedUrl) throw new Error("Could not start upload.");
  let put: Response;
  try {
    put = await fetch(signedUrl, {
      method: "PUT",
      body: file,
      headers: file.type ? { "Content-Type": file.type } : undefined,
    });
  } catch {
    throw new Error("Could not reach file storage. Please try again.");
  }
  if (!put.ok) throw new Error("Could not upload file to storage.");
  return { path };
}

export type PipelineChoice = { id: string; name: string };

export async function fetchPipelineChoices(signal?: AbortSignal): Promise<PipelineChoice[]> {
  const res = await fetch("/api/admin/pipelines/list", { signal });
  if (!res.ok) throw new Error(await readError(res, "Could not load pipelines."));
  const json = (await res.json()) as { pipelines: { id: string; name: string }[] };
  return json.pipelines.map((p) => ({ id: p.id, name: p.name }));
}

export type CreatePositionArgs = { chapterId: string; type: string; headcount: number; pipelineId: string; file?: File | null; people?: { profileId: string; role: "recruiter" | "interviewer" }[] };

export type PersonChoice = { id: string; name: string; email: string };

export async function fetchPeople(q: string, signal?: AbortSignal): Promise<PersonChoice[]> {
  const res = await fetch(`/api/admin/calendar/people?all=1&q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error(await readError(res, "Could not load people."));
  const json = (await res.json()) as { people: PersonChoice[] };
  return json.people.map((p) => ({ id: p.id, name: p.name, email: p.email }));
}

/** Uploads the JD (if any) then creates the Draft position. Returns the new row. */
export async function createPosition(a: CreatePositionArgs): Promise<PositionListRow> {
  const body: Record<string, unknown> = { chapterId: a.chapterId, type: a.type, headcount: a.headcount, pipelineId: a.pipelineId };
  if (a.people?.length) body.people = a.people;
  if (a.file) {
    const { path } = await uploadJd(a.file);
    body.jdStoragePath = path;
    body.jdOriginalFilename = a.file.name;
    body.jdMimeType = a.file.type || null;
  } else {
    body.blank = true;
  }
  const res = await fetch("/api/admin/positions", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await readError(res, "Could not create the position."));
  const json = (await res.json()) as { position: PositionListRow | null };
  if (!json.position) throw new Error("Position was created but could not be loaded.");
  return json.position;
}

/** Retry JD processing, optionally with a replacement file. */
export async function reprocessPosition(uuid: string, file?: File | null): Promise<void> {
  const body: Record<string, unknown> = {};
  if (file) {
    const { path } = await uploadJd(file);
    body.jdStoragePath = path;
    body.jdOriginalFilename = file.name;
    body.jdMimeType = file.type || null;
  }
  const res = await fetch(`/api/admin/positions/${uuid}/reprocess`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await readError(res, "Could not retry processing."));
}

export type PositionPatch = {
  title?: string;
  level?: string | null;
  type?: "Full-time" | "Internship";
  headcount?: number | string;
  deadline?: string | null;
  startDate?: string | null;
} & Partial<NonNullable<Job["details"]>>;

export async function updatePosition(uuid: string, patch: PositionPatch): Promise<PositionListRow | null> {
  const res = await fetch(`/api/admin/positions/${uuid}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(patch) });
  if (!res.ok) throw new Error(await readError(res, "Could not update the position."));
  return ((await res.json()) as { position: PositionListRow | null }).position;
}

export type PositionTransitionKind = "open" | "hold" | "reopen" | "close";

export type TransitionBlocker = { id: string; name: string; stage: string };

/** Close refused (409) because candidates are still in an offer/probation stage. */
export class TransitionBlockedError extends Error {
  constructor(message: string, readonly blocking: TransitionBlocker[]) {
    super(message);
    this.name = "TransitionBlockedError";
  }
}

export async function transitionPosition(
  uuid: string,
  to: PositionTransitionKind,
  opts: { notifyInterviewers?: boolean; reason?: string } = {},
): Promise<PositionListRow | null> {
  const res = await fetch(`/api/admin/positions/${uuid}/transition`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ to, ...opts }) });
  if (res.status === 409) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; blocking?: TransitionBlocker[] };
    if (Array.isArray(data.blocking)) throw new TransitionBlockedError(data.error ?? "Position cannot be closed yet.", data.blocking);
    throw new Error(data.error ?? "Could not change the position status.");
  }
  if (!res.ok) throw new Error(await readError(res, "Could not change the position status."));
  return ((await res.json()) as { position: PositionListRow | null }).position;
}

/** Removes an application from its position (DELETE /api/admin/candidates/[id]); upcoming interviews are canceled. */
export async function removeCandidate(caId: string, notifyInterviewers: boolean): Promise<void> {
  const res = await fetch(`/api/admin/candidates/${caId}?notify=${notifyInterviewers ? 1 : 0}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res, "Could not remove the candidate."));
}

export async function requestReview(uuid: string): Promise<void> {
  const res = await fetch(`/api/admin/positions/${uuid}/request-review`, { method: "POST", headers: JSON_HEADERS, body: "{}" });
  if (!res.ok) throw new Error(await readError(res, "Could not request review."));
}

export type { AccessGrantDto, AccessDirectoryPerson, PositionAccess } from "@/app/api/admin/positions/[id]/access/route";
import type { PositionAccess } from "@/app/api/admin/positions/[id]/access/route";

export async function fetchAccess(uuid: string, signal?: AbortSignal): Promise<PositionAccess> {
  const res = await fetch(`/api/admin/positions/${uuid}/access`, { signal });
  if (!res.ok) throw new Error(await readError(res, "Could not load access."));
  return (await res.json()) as PositionAccess;
}

export async function changeAccess(uuid: string, method: "POST" | "DELETE", kind: "chapter" | "person", targetId: string, role?: "recruiter" | "interviewer"): Promise<PositionAccess> {
  const res = await fetch(`/api/admin/positions/${uuid}/access`, { method, headers: JSON_HEADERS, body: JSON.stringify({ kind, targetId, role }) });
  if (!res.ok) throw new Error(await readError(res, method === "POST" ? "Could not grant access." : "Could not revoke access."));
  return (await res.json()) as PositionAccess;
}

export type CriterionInput = { requirement: string; importance: "must_have" | "nice_to_have" | "bonus"; origin: "jd" | "criteria" | "ai_inferred" | "manual" };
export type SavedCriterion = { id: string; requirement: string; importance: CriterionInput["importance"]; origin: CriterionInput["origin"] };

/** Replace the position's scoring criteria. `staleApplications` = scored candidates now needing a rescore. */
export async function saveCriteria(uuid: string, criteria: CriterionInput[]): Promise<{ requirements: SavedCriterion[]; staleApplications: number }> {
  const res = await fetch(`/api/admin/positions/${uuid}/criteria`, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ criteria }) });
  if (!res.ok) throw new Error(await readError(res, "Could not save the criteria."));
  return (await res.json()) as { requirements: SavedCriterion[]; staleApplications: number };
}

/** Queue AI re-matching of every application of the position against the current criteria. */
export async function rescorePosition(uuid: string): Promise<number> {
  const res = await fetch(`/api/admin/positions/${uuid}/rescore`, { method: "POST", headers: JSON_HEADERS, body: "{}" });
  if (!res.ok) throw new Error(await readError(res, "Could not start rescoring."));
  return ((await res.json()) as { queued: number }).queued;
}


export type CandidatesParams = {
  q?: string; stageMappingId?: string; subStateId?: string;
  sortBy?: string; sortDir?: "asc" | "desc"; limit?: number; offset?: number; all?: boolean;
};

export async function fetchPositionCandidates(uuid: string, params: CandidatesParams = {}, signal?: AbortSignal): Promise<PositionCandidatesResult> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "" && v !== false) qs.set(k, String(v));
  const res = await fetch(`/api/admin/positions/${uuid}/candidates${qs.size ? `?${qs}` : ""}`, { signal });
  if (!res.ok) throw new Error(await readError(res, "Could not load candidates."));
  return (await res.json()) as PositionCandidatesResult;
}

export function toCandidate(pc: PositionCandidate, id: number): Candidate {
  return {
    id,
    caId: pc.id,
    name: pc.name,
    headline: pc.headline,
    stage: pc.stageMappingId ?? "",
    sub: pc.subStageLabel ?? "",
    band: pc.band ?? undefined,
    score: pc.score ?? undefined,
    st: pc.scoring,
    err: pc.scoringError ?? undefined,
    source: pc.source,
    owner: "—",
    applied: ddmmyyyy(pc.appliedAt) ?? "",
    days: pc.daysInStage,
    salary: pc.expectedSalary ?? "",
    flags: [],
    offerAccepted: !!pc.offerAcceptedAt,
    mentorId: pc.mentorProfileId ?? undefined,
    mentorName: pc.mentorName ?? undefined,
    probationFailReason: pc.probationFailReason ?? undefined,
    probationExtendedUntil: pc.probationExtendedUntil ?? undefined,
    probationExtensionCount: pc.probationExtensionCount ?? 0,
  };
}

export function toStages(p: PositionPipelineStage[]): Stage[] {
  return p.map((st) => ({
    id: st.id,
    label: st.label,
    color: st.color || "var(--neutral-500)",
    subs: st.subs.map((x) => x.label),
    subIds: Object.fromEntries(st.subs.map((x) => [x.label, x.id])),
    def: (st.subs.find((x) => x.isDefault) ?? st.subs[0])?.label ?? "",
    pass: st.subs.find((x) => x.isPassed)?.label ?? "",
    fail: st.subs.find((x) => x.isTerminal && !x.isWithdraw && !x.isPassed)?.label,
    notPass: st.subs.filter((x) => x.isTerminal && !x.isWithdraw && !x.isPassed).map((x) => x.label),
    schedule: st.allowSchedule,
    sla: st.slaDays ?? undefined,
    probation: st.stageType === "probation",
  }));
}

/** Persists a stage / sub-stage change (PATCH /api/admin/candidates/[id]); writes stage history server-side. */
export async function updateCandidateStage(caId: string, stageMappingId: string, subStateId: string, reason?: string, notifyInterviewers?: boolean, cancelUpcoming?: boolean, startDate?: string, mentorProfileId?: string): Promise<void> {
  const res = await fetch(`/api/admin/candidates/${caId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_job_stage_mapping_id: stageMappingId, current_sub_state_id: subStateId, ...(reason ? { reason } : {}), notify_interviewers: notifyInterviewers ?? false, ...(cancelUpcoming ? { cancel_upcoming_sessions: true } : {}), ...(startDate ? { start_date: startDate } : {}), ...(mentorProfileId ? { mentor_profile_id: mentorProfileId } : {}) }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not update the candidate stage."));
}

/** Reverts a reject made in the last 10 minutes (POST /api/admin/candidates/[id]/reject/undo). */
export async function undoReject(caId: string): Promise<void> {
  const res = await fetch(`/api/admin/candidates/${caId}/reject/undo`, { method: "POST" });
  if (!res.ok) throw new Error(await readError(res, "Could not undo the reject."));
}

export type CvFileState = "pending" | "uploading" | "queued" | "error";
export type CvUploadResult = { batchId: string | null; ok: number; failed: number };

/** PUT a file to a signed URL, reporting byte progress. */
function putWithProgress(url: string, file: File, mimeType: string | null, onProgress: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (mimeType) xhr.setRequestHeader("Content-Type", mimeType);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Could not upload file to storage.")));
    xhr.onerror = () => reject(new Error("Could not upload file to storage."));
    xhr.send(file);
  });
}

/**
 * Uploads CVs into a position (`target` = position uuid) or the talent pool
 * (`"pool"`). `recruiter` defaults to the session user server-side.
 * init -> S3 PUTs (bounded concurrency, byte progress) -> enqueue.
 */
export async function uploadPositionCvs(
  target: string,
  files: File[],
  source: string,
  onFile: (index: number, state: CvFileState, error?: string) => void,
  opts: { recruiter?: string; onBytes?: (index: number, loaded: number) => void } = {},
): Promise<CvUploadResult> {
  const base = `/api/admin/positions/${encodeURIComponent(target)}/cv-uploads`;
  const init = await fetch(base, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ source, recruiter: opts.recruiter || undefined, files: files.map((f) => ({ fileName: f.name, mimeType: f.type || null, size: f.size })) }),
  });
  if (!init.ok) throw new Error(await readError(init, "Could not start the upload."));
  const { batchId, files: slots } = (await init.json()) as { batchId: string; files: { id: string; signedUrl: string; mimeType: string | null }[] };

  const uploaded: { id: string; index: number }[] = [];
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const i = next++;
      const slot = slots[i];
      onFile(i, "uploading");
      try {
        await putWithProgress(slot.signedUrl, files[i], slot.mimeType, (n) => opts.onBytes?.(i, n));
        opts.onBytes?.(i, files[i].size);
        uploaded.push({ id: slot.id, index: i });
      } catch (e) {
        onFile(i, "error", e instanceof Error ? e.message : "Upload failed.");
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(10, files.length) }, worker));

  let ok = 0;
  if (uploaded.length) {
    const res = await fetch(`${base}/enqueue`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ fileUploadIds: uploaded.map((u) => u.id) }) });
    if (!res.ok) {
      const msg = await readError(res, "Could not queue files for processing.");
      uploaded.forEach((u) => onFile(u.index, "error", msg));
    } else {
      const { results } = (await res.json()) as { results: { id: string; ok: boolean; error?: string }[] };
      for (const r of results) {
        const u = uploaded.find((x) => x.id === r.id);
        if (!u) continue;
        if (r.ok) { ok++; onFile(u.index, "queued"); } else onFile(u.index, "error", r.error);
      }
    }
  }
  return { batchId, ok, failed: files.length - ok };
}

type HistoryFile = {
  id: string; fileName: string; kind: "new" | "existing" | "dup_job" | "same_file" | "failed" | "processing";
  candidateName: string | null; errorMessage: string | null; errorStage: string | null; score: number | null;
  candidateId: string | null; errorCode: string | null; storageKey: string; mimeType: string | null;
  fileSource: string | null; recruiter: string | null; inProgress: boolean; createdAt: string;
};
export type CvUploadHistoryResponse = {
  batches: { id: string; at: string; by: string; source: string; files: HistoryFile[] }[];
};

const DID: Record<HistoryFile["kind"], string> = {
  new: "Created a new application",
  existing: "Re-read and re-scored",
  dup_job: "Already applied to this position",
  same_file: "Identical file already uploaded",
  failed: "Failed",
  processing: "Processing…",
};

/** Upload history of a position (`target` = position uuid or "pool"). */
export async function fetchUploadHistory(target: string, signal?: AbortSignal): Promise<Batch[]> {
  const res = await fetch(`/api/admin/positions/${target}/cv-uploads/history`, { signal });
  if (!res.ok) throw new Error(await readError(res, "Could not load upload history."));
  const { batches } = (await res.json()) as CvUploadHistoryResponse;
  const now = Date.now();
  return batches.map((b) => ({
    id: b.id,
    at: ddmmyyyy(b.at) ?? "",
    ago: Math.floor((now - new Date(b.at).getTime()) / 86400000),
    by: b.by,
    source: b.source,
    files: b.files.map((f): BatchFile => ({
      id: f.id,
      file: f.fileName,
      kind: f.kind,
      cand: f.candidateName ?? undefined,
      candUuid: f.candidateId ?? undefined,
      errorCode: f.errorCode,
      errorStage: f.errorStage,
      storageKey: f.storageKey,
      mimeType: f.mimeType,
      fileSource: f.fileSource,
      recruiter: f.recruiter,
      inProgress: f.inProgress,
      matched: f.kind === "existing" || f.kind === "dup_job" ? "Existing candidate" : "—",
      did: f.kind === "failed" ? f.errorMessage || "Failed" : DID[f.kind],
      score: f.score ?? undefined,
    })),
  }));
}

const upBase = (target: string) => `/api/admin/positions/${encodeURIComponent(target)}/cv-uploads`;

export type RetryOutcome = { id: string; ok: boolean; error?: string };
/** Re-queue failed uploads. */
export async function retryUploads(target: string, ids: string[]): Promise<RetryOutcome[]> {
  const res = await fetch(`${upBase(target)}/retry`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ ids }) });
  if (!res.ok) throw new Error(await readError(res, "Could not retry the upload."));
  return ((await res.json()) as { results: RetryOutcome[] }).results;
}

/** Mark an upload with a new status (e.g. resolve a failure manually). */
export async function changeUploadStatus(target: string, fileId: string, body: { status: string; errorCode?: string | null; errorMessage?: string | null; errorStage?: string | null }): Promise<void> {
  const res = await fetch(`${upBase(target)}/${encodeURIComponent(fileId)}/change-status`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await readError(res, "Could not update the upload."));
}

export type CandidateApplication = {
  id: string; jobId: string; jobTitle: string; appliedAt: string | null; cvOriginalFilename: string | null;
  stageLabel: string | null; subStageLabel: string | null;
};
/** Applications of the candidate identified by an upload. */
export async function fetchCandidateApplications(target: string, fileId: string): Promise<CandidateApplication[]> {
  const res = await fetch(`${upBase(target)}/${encodeURIComponent(fileId)}/candidate-applications`);
  if (!res.ok) throw new Error(await readError(res, "Could not load applications."));
  return ((await res.json()) as { applications: CandidateApplication[] }).applications;
}

/* ───────── Candidate detail tabs (keyed by campaign_applied.id) ───────── */

const candBase = (id: string) => `/api/admin/candidates/${encodeURIComponent(id)}`;

export type MatchStatus = "meets" | "partial" | "not_met" | "unknown";
export type MatchCriterion = {
  id: string; req: string; imp: string; origin: string; status: MatchStatus; evidence: string;
  override: { reason: string | null; original: MatchStatus | null } | null;
};
export type CandidateMatch = {
  score: number | null; status: string | null; error: string | null;
  summary: string; meta: string;
  composition: {
    ai: number | null; formula: number | null; aiWeight: number | null;
    breakdown: unknown; model: string | null; provider: string | null;
  } | null;
  criteria: MatchCriterion[];
  stale: boolean;
};

export async function fetchCandidateMatch(caId: string, signal?: AbortSignal): Promise<CandidateMatch> {
  const res = await fetch(`${candBase(caId)}/match`, { signal });
  if (!res.ok) throw new Error(await readError(res, "Could not load the match."));
  return (await res.json()) as CandidateMatch;
}

export async function overrideCriterion(caId: string, key: string, verdict: "met" | "partial" | "missing" | "unclear", reason: string | null): Promise<void> {
  const res = await fetch(`${candBase(caId)}/match/overrides/${encodeURIComponent(key)}`, {
    method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ verdict, reason }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not save the override."));
}

export async function revertCriterion(caId: string, key: string): Promise<void> {
  const res = await fetch(`${candBase(caId)}/match/overrides/${encodeURIComponent(key)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res, "Could not revert the override."));
}

export async function rescoreCandidate(caId: string): Promise<void> {
  const res = await fetch(`${candBase(caId)}/rescore`, { method: "POST" });
  if (!res.ok) throw new Error(await readError(res, "Could not rescore."));
}

export type CandidateCv = {
  id: string; versionNumber: number; sourceEvent: string; changeSummary: string | null;
  createdAt: string; createdBy: string | null; filename: string | null; mimeType: string | null;
  parsingStatus: string | null; parsingError: string | null; parsedPayload: unknown;
  fields: {
    role: string | null; degree: string | null; education: string | null; experienceYears: string | null;
    gpa: string | null; englishLevel: string | null; studentYears: string | null; dateOfBirth: string | null; skills: string[];
  };
  diff: string[]; isActive: boolean; versionCount: number;
};

export async function fetchCandidateCv(caId: string, version?: number, signal?: AbortSignal): Promise<CandidateCv> {
  const q = version != null ? `?version=${version}` : "";
  const res = await fetch(`${candBase(caId)}/cv${q}`, { signal });
  if (!res.ok) throw new Error(await readError(res, "Could not load the CV."));
  return (await res.json()) as CandidateCv;
}

export type CvVersionItem = {
  kind: "active" | "archived_cv" | "snapshot_event"; sortAt: string; isLatest: boolean;
  versionEventId: string; versionNumber: number; eventType?: string; changeSummary: string | null;
};
export async function fetchCvHistory(caId: string, signal?: AbortSignal): Promise<CvVersionItem[]> {
  const res = await fetch(`${candBase(caId)}/cv-history`, { signal });
  if (!res.ok) throw new Error(await readError(res, "Could not load CV history."));
  return ((await res.json()) as { versions: CvVersionItem[] }).versions;
}

/** Lightweight file info; the viewer iframes `cvFileUrl` itself. */
export async function fetchCvFileMeta(caId: string, signal?: AbortSignal): Promise<{ mimeType: string }> {
  const res = await fetch(`${candBase(caId)}/cv-download?meta=1`, { signal });
  if (!res.ok) throw new Error(await readError(res, "No CV file on record."));
  return (await res.json()) as { mimeType: string };
}
export const cvFileUrl = (caId: string, versionId?: string) =>
  `${candBase(caId)}/cv-download${versionId ? `?versionId=${encodeURIComponent(versionId)}` : ""}`;

export type CvEdit = {
  role?: string | null; degree?: string | null; school?: string | null;
  experience_years?: number; skills?: string[]; change_summary?: string;
};
export async function saveCvEdits(caId: string, edit: CvEdit): Promise<void> {
  const res = await fetch(`${candBase(caId)}/profile`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(edit) });
  if (!res.ok) throw new Error(await readError(res, "Could not save the CV."));
}

export type InterviewNote = {
  id: string; body: string; created_at: string; updated_at: string;
  author_id: string | null; author_username: string | null;
};
export async function fetchInterviewNotes(caId: string, signal?: AbortSignal): Promise<InterviewNote[]> {
  const res = await fetch(`${candBase(caId)}/interview-notes`, { signal });
  if (!res.ok) throw new Error(await readError(res, "Could not load notes."));
  return ((await res.json()) as { notes: InterviewNote[] }).notes;
}
export async function saveInterviewNote(caId: string, body: string, noteId?: string): Promise<InterviewNote> {
  const res = await fetch(`${candBase(caId)}/interview-notes`, {
    method: noteId ? "PATCH" : "POST", headers: JSON_HEADERS,
    body: JSON.stringify(noteId ? { noteId, body } : { body }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not save the note."));
  return ((await res.json()) as { note: InterviewNote }).note;
}

export type ScheduleSeat = { id: string; name: string; declinedAt: string | null; declineReason: string | null; submitted: boolean };
export type CandidateSchedule = {
  id: string | number; interviewers: string[]; seats: ScheduleSeat[]; organizerName: string | null; canEdit: boolean; [k: string]: unknown;
};
export async function fetchSchedules(caId: string, signal?: AbortSignal): Promise<CandidateSchedule[]> {
  const res = await fetch(`${candBase(caId)}/timeline`, { signal });
  if (!res.ok) throw new Error(await readError(res, "Could not load interviews."));
  return ((await res.json()) as { schedules: CandidateSchedule[] }).schedules;
}

/** BR-INT-09: marks a started session as a no-show (whole session). */
export async function markNoShow(caId: string, scheduleId: string): Promise<void> {
  const res = await fetch(`${candBase(caId)}/timeline/no-show`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scheduleId }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not mark the no-show."));
}

export type MyInterview = {
  id: string; start: string; end: string; durationMin: number; round: string | null; status: string;
  mode: "online" | "office" | null; location: string | null; meetingLink: string | null;
  campaignAppliedId: string; candidateId: string; candidateName: string | null; jobId: string | null;
  organizerId: string | null; organizerName: string | null;
  submitted: boolean; upcoming: boolean; pendingEvaluation: boolean; evaluationDueAt: string; overdue: boolean;
};
/** The viewer's own interviewer seats across positions. */
export async function fetchMyInterviews(signal?: AbortSignal): Promise<MyInterview[]> {
  const res = await fetch("/api/admin/calendar/mine", { signal });
  if (!res.ok) throw new Error(await readError(res, "Could not load your interviews."));
  return ((await res.json()) as { interviews: MyInterview[] }).interviews;
}

export type ActivityPage = { items: TimelineItem[]; nextCursor: string | null };
export async function fetchActivity(caId: string, cursor?: string | null, signal?: AbortSignal): Promise<ActivityPage> {
  const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const res = await fetch(`${candBase(caId)}/activity${q}`, { signal });
  if (!res.ok) throw new Error(await readError(res, "Could not load activity."));
  return (await res.json()) as ActivityPage;
}

export type CandidateApplicationRow = {
  id: string; jobTitle: string; jobId: string | null; appliedAt: string; cvUploadedAt: string;
  [k: string]: unknown;
};
export async function fetchApplications(caId: string, signal?: AbortSignal): Promise<CandidateApplicationRow[]> {
  const res = await fetch(`${candBase(caId)}/applications`, { signal });
  if (!res.ok) throw new Error(await readError(res, "Could not load applications."));
  return ((await res.json()) as { applications: CandidateApplicationRow[] }).applications;
}

/** HR records (or clears) the candidate's acceptance of the offer (PUT /api/admin/candidates/[id]/offer-acceptance). */
export async function setOfferAccepted(caId: string, accepted: boolean): Promise<void> {
  const res = await fetch(`/api/admin/candidates/${caId}/offer-acceptance`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accepted }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not record the offer acceptance."));
}

export type { PositionMember } from "@/app/api/admin/positions/[id]/members/route";
import type { PositionMember } from "@/app/api/admin/positions/[id]/members/route";

/** People already added to the position; the Mentor for a probation hire is picked from these. */
export async function fetchPositionMembers(uuid: string, signal?: AbortSignal): Promise<PositionMember[]> {
  const res = await fetch(`/api/admin/positions/${uuid}/members`, { signal });
  if (!res.ok) throw new Error(await readError(res, "Could not load the people on this position."));
  return ((await res.json()) as { members: PositionMember[] }).members;
}

/** RM / HR / Admin: assign or replace the probation Mentor. */
export async function changeMentor(caId: string, mentorProfileId: string, reason?: string): Promise<void> {
  const res = await fetch(`/api/admin/candidates/${caId}/mentor`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ mentor_profile_id: mentorProfileId, ...(reason ? { reason } : {}) }) });
  if (!res.ok) throw new Error(await readError(res, "Could not change the Mentor."));
}

/** Mentor / RM / HR: extend (gia hạn) the probation; a reason is required. */
export async function extendProbation(caId: string, newEndDate: string, reason: string): Promise<void> {
  const res = await fetch(`/api/admin/candidates/${caId}/probation-extend`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ new_end_date: newEndDate, reason }) });
  if (!res.ok) throw new Error(await readError(res, "Could not extend the probation."));
}
