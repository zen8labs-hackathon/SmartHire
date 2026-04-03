import { CANDIDATE_ROWS } from "@/lib/candidates/mock-data";

export type EnglishLevel = "intermediate" | "advanced" | "native";

export type CvReviewDetail = {
  candidateId: string;
  fullName: string;
  dateOfBirth: string;
  mobile: string;
  email: string;
  sourcingChannel: string;
  majorSchool: string;
  studentYears: string;
  gpa: string;
  englishLevel: EnglishLevel;
  skills: string[];
  matchScore: number;
  insightTitle: string;
  insightBody: string;
  targetRole: string;
  lastEditedBy: string;
  lastEditedAgo: string;
};

const SOURCING_OPTIONS = [
  "LinkedIn Recruiter",
  "Employee Referral",
  "Direct Application",
  "Agency Partner",
] as const;

const DEFAULT: Omit<CvReviewDetail, "candidateId" | "fullName"> = {
  dateOfBirth: "14 May 1994",
  mobile: "+44 7700 900077",
  email: "alex.thorne@design-studio.co",
  sourcingChannel: "LinkedIn Recruiter",
  majorSchool: "BSc Computer Science, MIT",
  studentYears: "2012 - 2016",
  gpa: "3.9 / 4.0",
  englishLevel: "advanced",
  skills: [
    "Figma",
    "React Native",
    "Tailwind CSS",
    "TypeScript",
    "Node.js",
    "GraphQL",
  ],
  matchScore: 88,
  insightTitle: "High Potential Candidate",
  insightBody:
    "Strong alignment with the Senior Product Designer role. Exceptional academic record at MIT and relevant technical stack in React/Tailwind. Candidate demonstrates cross-functional leadership qualities and significant growth potential within the pipeline.",
  targetRole: "Senior Product Designer",
  lastEditedBy: "Sarah Jenkins",
  lastEditedAgo: "2h ago",
};

export function getSourcingOptions(): readonly string[] {
  return SOURCING_OPTIONS;
}

/** Mock AI-scanned CV review payload; merges list name when the id exists in the talent pool. */
export function getCvReview(candidateId: string): CvReviewDetail {
  const row = CANDIDATE_ROWS.find((r) => r.id === candidateId);
  return {
    candidateId,
    fullName: row?.name ?? "Alexander Thorne",
    ...DEFAULT,
  };
}
