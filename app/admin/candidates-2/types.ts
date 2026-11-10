// UI types for Candidates 2. Kept free of mock data so api.ts can import them.

export type Persona = {
  key: "hr" | "ch" | "rc" | "iv" | "ad";
  name: string;
  role: string;
  salary: boolean;
  allJobs?: boolean;
  admin?: boolean;
  chapter?: string;
  shared?: number[];
  assigned?: number[];
  canCreate: boolean;
  canDecide: boolean;
  hideScore?: boolean;
};

export type Job = {
  id: number;
  title: string;
  chapter: string;
  status: "Open" | "Draft" | "On hold" | "Closed";
  headcount: number;
  hired: number;
  deadline: string | null;
  candidates: number;
};

export type AppResult = "open" | "ended" | "pool" | "official" | "probation" | "hired";

export type CandApp = {
  id: string;
  job: number | null;
  title: string;
  chapter: string | null;
  jobStatus: string | null;
  date: string;
  stage: string;
  sub: string;
  result: AppResult;
  round?: string;
  band?: string;
  score?: number;
  scoreErr?: boolean;
  scoring?: boolean;
  iv?: number;
  notes?: number;
  evals?: number;
  salary?: string;
  jc?: number;
  from?: string;
  end?: string;
  reasonGroup?: string;
  reason?: string;
  by?: string;
  rk?: string;
};

export type CvUse = { app: string; v?: number; inUse?: boolean; note?: string };

export type Cv = {
  id: string;
  file: string;
  date: string;
  by: string;
  batch: string;
  source: string;
  matched: string;
  status: "parsed" | "failed";
  error?: string;
  latest?: boolean;
  change?: string;
  uses: CvUse[];
};

export type Ev = { d: string; type: string; icon: string; title: string; sub?: string; app?: string; missing?: boolean };

export type Person = {
  id: number;
  /** Server-computed cooldown application id (BR-06); undefined for mock data. */
  cooldownApp?: string | null;
  /** Backend candidate uuid (set once the profile is loaded from the API). */
  uuid?: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  exp: number;
  skills: string[];
  degree: string;
  education: string;
  english: string;
  dob: string;
  company: string;
  source: string;
  created: string;
  updated: string;
  alumni?: string;
  isStarred?: boolean;
  dupOf?: number;
  apps: CandApp[];
  /** Total applications; `apps` holds only the latest on the list page. */
  appCount?: number;
  cvs: Cv[];
  edits?: { exp?: { ai: number; by: string; at: string; reason: string } };
  conflict?: { field: string; cv: number; file: string } | null;
  tags: string[];
  log: Ev[];
  extra?: Ev[];
  rehire: { v: "eligible" | "ask" | "no"; reason: string; by: string; at: string } | { v: null; reason?: string; by?: string; at?: string };
  remind?: { date: string; note: string; owner: string } | null;
  consent: { date: string; via: string };
};
