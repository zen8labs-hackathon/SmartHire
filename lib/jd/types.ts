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
  /** YYYY-MM-DD — first day of active hiring for this JD */
  start_date: string | null;
  /** YYYY-MM-DD — set when status is Done or Closed */
  end_date: string | null;
  update_note: string | null;
  work_location: string | null;
  reporting: string | null;
  role_overview: string | null;
  duties_and_responsibilities: string | null;
  experience_requirements_must_have: string | null;
  experience_requirements_nice_to_have: string | null;
  what_we_offer: string | null;
  // Detailed intake fields (managed via Edit modal)
  level: string | null;
  headcount: number | null;
  hire_type: string | null;
  project_info: string | null;
  team_size: string | null;
  language_requirements: string | null;
  career_development: string | null;
  other_requirements: string | null;
  salary_range: string | null;
  project_allowances: string | null;
  interview_process: string | null;
  /** YYYY-MM-DD */
  hiring_deadline: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
  /** Set by GET /api/admin/job-descriptions aggregation */
  applicant_count?: number;
  /** Whether a JD document exists on a linked job opening */
  has_jd_source_file?: boolean;
};

/** Form payload for create / update */
export type JobDescriptionFormData = {
  position: string;
  department: string;
  /** From JD (e.g. Fulltime, Part-time) */
  employment_status: string;
  status: JdStatus;
  /** YYYY-MM-DD or "" when unset */
  start_date: string;
  update_note: string;
  work_location: string;
  reporting: string;
  role_overview: string;
  duties_and_responsibilities: string;
  experience_requirements_must_have: string;
  experience_requirements_nice_to_have: string;
  what_we_offer: string;
};

/**
 * Form payload for the Edit JD modal.
 * Covers the structured intake fields collected from hiring managers.
 * Uses strings for all text fields; headcount is a numeric string.
 */
export type JdEditFormData = {
  /** Level (e.g. Junior, Mid, Senior, Lead) */
  level: string;
  /** Number of hires needed — stored as integer, used as numeric string in form */
  headcount: string;
  /** "Tuyển mới" | "Tuyển thay thế" | free text */
  hire_type: string;
  /** Reporting to (reuses existing column) */
  reporting: string;
  /** General project info: product, stage, pressure, OT, etc. */
  project_info: string;
  /** Expected responsibilities of the candidate in the project */
  duties_and_responsibilities: string;
  /** Team composition: size and roles */
  team_size: string;
  /** Must-have requirements (reuses existing column) */
  experience_requirements_must_have: string;
  /** Nice-to-have requirements (reuses existing column) */
  experience_requirements_nice_to_have: string;
  /** Language requirements: language, proficiency, certifications */
  language_requirements: string;
  /** Career growth and development opportunities */
  career_development: string;
  /** Other requirements: personality, gender, age if applicable */
  other_requirements: string;
  /** Gross salary range */
  salary_range: string;
  /** Project / role-specific allowances or bonuses */
  project_allowances: string;
  /** Interview process: rounds, participants, tests */
  interview_process: string;
  /** Hiring deadline — YYYY-MM-DD or "" */
  hiring_deadline: string;
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
