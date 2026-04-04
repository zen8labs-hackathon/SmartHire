export type CandidateStatus = "New" | "Shortlisted" | "Interviewing";

export type CandidateRow = {
  id: string;
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
  /** Display label for HR sourcing channel (includes custom text when source is Other) */
  sourceLabel: string;
  /** 0–100 from AI vs job description; null if not computed yet */
  jdMatchScore: number | null;
  /** Short UI label for the match column */
  jdMatchLabel: string;
  jdMatchRationale: string | null;
  /** Populated when jd_match_status is failed */
  jdMatchError: string | null;
};
