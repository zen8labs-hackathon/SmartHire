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
};
