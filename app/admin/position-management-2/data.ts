// Types and static config for the position-management-2 design.

export type RoleKey = "hr" | "ch" | "rc" | "iv";
export type Role = {
  key: RoleKey;
  name: string;
  role: string;
  salary: boolean;
  allJobs?: boolean;
  chapter?: string;
  shared?: number[];
  assigned?: number[];
  canCreate: boolean;
  canDecide: boolean;
  hideScore?: boolean;
};
export type Notif = {
  id: string;
  title: string;
  body: string;
  time: string;
  unread: boolean;
  action?: string;
  href: [number, string, number?];
  roles: RoleKey[];
};
export type TimelineItem = { text: string; by: string; at: string; human?: boolean; reason?: string };
export type JobStatus = "Open" | "Draft" | "On hold" | "Closed";
export type Job = {
  id: number;
  title: string;
  chapter: string;
  level: string;
  type: string;
  status: JobStatus;
  headcount: number;
  hired: number;
  deadline: string | null;
  daysLeft?: number;
  candidates: number;
  attention: number;
  owner: string;
  updated: string;
  draftNote?: string | null;
  processing?: "upload" | "extract" | "llm" | null;
  /** Set when background JD processing failed (BR-02-27); retry via the reprocess API. */
  procError?: string | null;
  fresh?: boolean;
  legacy?: boolean;
  /** Free-text JD columns; null/empty when not extracted or entered. */
  /** All chapters of the position (loaded with details). */
  chapters?: string[];
  details?: Record<"department" | "reporting" | "roleOverview" | "duties" | "workLocation" | "mustHave" | "niceToHave" | "benefits" | "languages" | "project" | "teamSize" | "salaryRange", string | null>;
  blank?: boolean;
  file?: string;
  criteria?: { id: string; req: string; imp: string; origin: "AI" | "HR" }[];
  reviewRequested?: boolean;
  note?: string;
};
export type StageId = "cv" | "iv" | "offer" | "probation" | "hired";
export type Stage = {
  id: string;
  color: string;
  label: string;
  subs: string[];
  /** sub-stage label → pipeline sub_state id (real data only). */
  subIds?: Record<string, string>;
  def: string;
  pass: string;
  fail?: string;
  /** Sub-stage labels that record Not pass (terminal, not passed, not withdrawn); real data only. */
  notPass?: string[];
  schedule?: boolean;
  /** Per-job SLA in days (real data only). */
  sla?: number;
  probation?: boolean;
  template?: string;
  rounds?: { name: string; template: string }[];
};
export type Band = "strong" | "good" | "partial" | "limited" | "review";
export type Candidate = {
  id: number;
  /** campaign_applied uuid; keys the /api/admin/candidates/[id]/* routes. */
  caId?: string;
  name: string;
  headline: string;
  /** Static stage id, or a pipeline stage-mapping uuid for real positions. */
  stage: string;
  sub: string;
  round?: string;
  hold?: { what: string; who: string } | null;
  band?: Band;
  score?: number;
  ai?: number;
  formula?: number;
  st: "done" | "error" | "scoring" | "none";
  err?: string;
  source: string;
  owner: string;
  applied: string;
  days: number;
  salary: string;
  flags?: string[];
  notes?: number;
  noNote?: boolean;
   ivDone?: boolean;
  ivNote?: string;
  prob?: unknown;
  /** HR has recorded that the candidate accepted the offer. */
  offerAccepted?: boolean;
  /** Probation Mentor (users.id / name); unset for legacy rows. */
  mentorId?: string;
  mentorName?: string;
  probationFailReason?: string;
  probationExtendedUntil?: string;
  probationExtensionCount?: number;
};
export type Criterion = {
  id: string;
  req: string;
  imp: string;
  origin: "AI" | "HR";
  status: "meets" | "partial" | "not_met" | "unknown";
  evidence?: string;
  src?: string;
};
export type AttentionItem = {
  id: string;
  group: string;
  kind: string;
  fs?: string;
  tech?: string;
  file: string;
  title: string;
  detail: string;
  actions: string[];
  cand?: number;
};
export type BatchFile = {
  file: string;
  kind: "new" | "existing" | "dup_job" | "suspected" | "failed" | "same_file" | "processing";
  /** Real upload id (file_uploads.id) when loaded from the API. */
  id?: string;
  candUuid?: string;
  errorCode?: string | null;
  errorStage?: string | null;
  storageKey?: string;
  mimeType?: string | null;
  fileSource?: string | null;
  recruiter?: string | null;
  inProgress?: boolean;
  cand?: string;
  candId?: number;
  since?: string;
  matched: string;
  did: string;
  prev?: number;
  score?: number;
  handled?: string;
};
export type Batch = { id: string; at: string; ago: number; by: string; source: string; files: BatchFile[] };
export type Pool = { id: "pool"; title: string; candidates: number; attention: number; note: string };
export type AccessData = {
  chapters: { name: string; by: string; at: string; members: number }[];
  people: { name: string; role: string; via: string; by: string; at: string; salary: boolean; cands?: number }[];
};

/** Pipeline stage configuration (static config, not data). */
export const STAGES: Stage[] = [
  { id: 'cv', color: 'var(--chart-6)', label: 'CV Scan', subs: ['New', 'Consider', 'Passed', 'Failed'], def: 'New', pass: 'Passed', fail: 'Failed' },
  { id: 'iv', color: 'var(--chart-1)', label: 'Interview', subs: ['New', 'Consider', 'Passed', 'Failed'], def: 'New', pass: 'Passed', fail: 'Failed', schedule: true, template: 'Technical interview v2', rounds: [{ name: 'Interview 1', template: 'Technical interview v2' }, { name: 'Interview 2', template: 'Culture & client fit' }] },
  { id: 'offer', color: 'var(--chart-2)', label: 'Offer', subs: ['New', 'Matched', 'Offer', 'Rejected'], def: 'New', pass: 'Offer', fail: 'Rejected' },
  { id: 'probation', color: 'var(--chart-5)', label: 'Probation', subs: ['Awaiting start', 'In progress', 'Review submitted', 'Passed', 'Not passed', 'Ended early', 'Did not start'], def: 'Awaiting start', pass: 'Passed', probation: true, template: 'Probation review · Engineering v1' },
  { id: 'hired', color: 'var(--chart-4)', label: 'Official', subs: ['Official'], def: 'Official', pass: 'Official' }
];

export const STAGE_COLORS: Record<string, string> = { 'CV Scan': 'var(--chart-6)', Interview: 'var(--chart-1)', Applied: 'var(--chart-6)', Screening: 'var(--chart-3)', 'Technical test': 'var(--chart-4)', 'Interview 1': 'var(--chart-1)', 'Interview 2': 'var(--chart-1)', 'Mentor interview': 'var(--chart-4)', Offer: 'var(--chart-2)', Probation: 'var(--chart-5)', Official: 'var(--chart-4)', Hired: 'var(--chart-4)' };

export const stageColor = (k: string) => {
  const s = STAGES.find((x) => x.id === k || x.label === k);
  return s?.color || STAGE_COLORS[k] || "var(--neutral-500)";
};

export const stageOf = (id: string, stages: Stage[] = STAGES): Stage => stages.find((s) => s.id === id) ?? stages[0] ?? STAGES[0];

const SRC: Record<string, [string, string]> = { LinkedIn: ['linkedin', 'linkedin'], Referral: ['referral', 'user-plus'], 'Career site': ['site', 'globe'], Email: ['email', 'mail'], 'Partner school': ['school', 'graduation-cap'] };
export const srcInfo = (s: string): [string, string] => SRC[s] || ['other', 'inbox'];
