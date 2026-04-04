export type CandidateStatus =
  | "New"
  | "Shortlisted"
  | "Interviewing"
  | "Offer"
  | "Failed"
  | "Matched"
  | "Rejected";

export type CandidateRow = {
  id: string;
  /** True when a CV object exists in storage for this candidate (signed URL via API). */
  hasCvFile: boolean;
  name: string;
  role: string;
  avatarUrl: string | null;
  experienceYears: number;
  skills: string[];
  /** Extra skills count shown as "+N" when more than visible tags */
  moreSkills?: number;
  degree: string;
  school: string;
  status: CandidateStatus;
  chapter: string;
  /** Campaign UUID when CV was uploaded to a job opening; null if unassigned */
  jobOpeningId: string | null;
  /** Job description position (or opening title) for the applied campaign */
  jdCampaignLabel: string;
  /** Display label for HR sourcing channel (includes custom text when source is Other) */
  sourceLabel: string;
  /** 0–100 from AI vs job description; null if not computed yet */
  jdMatchScore: number | null;
  /** Short UI label for the match column */
  jdMatchLabel: string;
  jdMatchRationale: string | null;
  /** Populated when jd_match_status is failed */
  jdMatchError: string | null;
  /** ISO timestamp for CV upload time (`cv_uploaded_at`), else `created_at` — used for filters and display */
  cvUploadedAtIso: string | null;
};
