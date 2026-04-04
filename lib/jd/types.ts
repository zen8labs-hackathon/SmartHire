export type JdStatus = "Done" | "Hiring" | "Pending" | "Closed";

export const JD_STATUS_OPTIONS: readonly JdStatus[] = [
  "Done",
  "Hiring",
  "Pending",
  "Closed",
];

export function isJdStatus(value: string): value is JdStatus {
  return (JD_STATUS_OPTIONS as readonly string[]).includes(value);
}

/** Map legacy DB values and unknown strings to the current enum. */
export function coerceJdStatus(value: string): JdStatus {
  if (isJdStatus(value)) return value;
  if (value === "Active") return "Hiring";
  if (value === "Draft") return "Pending";
  return "Pending";
}

/** DB row shape for public.job_descriptions */
export type JobDescription = {
  id: number;
  position: string;
  department: string | null;
  /** From JD text (e.g. Fulltime) — not workflow JD status */
  employment_status?: string | null;
  status: JdStatus;
  update_note: string | null;
  work_location: string | null;
  reporting: string | null;
  role_overview: string | null;
  duties_and_responsibilities: string | null;
  experience_requirements_must_have: string | null;
  experience_requirements_nice_to_have: string | null;
  what_we_offer: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
};

/** Form payload for create / update */
export type JobDescriptionFormData = {
  position: string;
  department: string;
  /** From JD (e.g. Fulltime, Part-time) */
  employment_status: string;
  status: JdStatus;
  update_note: string;
  work_location: string;
  reporting: string;
  role_overview: string;
  duties_and_responsibilities: string;
  experience_requirements_must_have: string;
  experience_requirements_nice_to_have: string;
  what_we_offer: string;
};

/** Document fields returned by POST /api/admin/job-descriptions/extract */
export type JdExtractedFormFields = Pick<
  JobDescriptionFormData,
  | "position"
  | "department"
  | "employment_status"
  | "update_note"
  | "work_location"
  | "reporting"
  | "role_overview"
  | "duties_and_responsibilities"
  | "experience_requirements_must_have"
  | "experience_requirements_nice_to_have"
  | "what_we_offer"
>;

// ---------------------------------------------------------------------------
// Legacy types kept for pipeline mock data compatibility
// ---------------------------------------------------------------------------

export type JdRow = {
  id: string;
  jobTitle: string;
  chapter: string;
  campaign: string;
  status: JdStatus;
};

export type JdVersionEntry = {
  version: string;
  date: string;
  author: string;
  isCurrent?: boolean;
};

export type JdCandidate = {
  id: string;
  initials: string;
  name: string;
  stage: string;
};

export type JdDetail = {
  rowId: string;
  title: string;
  category: string;
  campaign: string;
  status: JdStatus;
  description: string;
  responsibilities: string[];
  requirements: string;
  versions: JdVersionEntry[];
  candidates: JdCandidate[];
};

export type JdKpi = {
  id: string;
  value: string;
  label: string;
  hint?: string;
};

export type JdVersionChip = {
  id: string;
  label: string;
  filter: string;
};
