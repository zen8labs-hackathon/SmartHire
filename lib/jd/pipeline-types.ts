export type JobPipelineStatus =
  | "INTERVIEWING"
  | "CV SCREENING"
  | "REJECTED"
  | "OFFER"
  | "MATCHED"
  | "NEW";

export type JobPipelineCandidateRow = {
  /** UUID: deterministic per JD + row index (mock) or `candidates.id` when wired to DB */
  id: string;
  name: string;
  verified?: boolean;
  dateOfBirth: string;
  mobile: string;
  email: string;
  studentYears: string;
  majorSchool: string;
  gpa: string;
  english: string;
  relatedSkills: string;
  status: JobPipelineStatus;
};

export type JobPipelineViewModel = {
  jobId: string;
  jobTitle: string;
  totalCandidates: number;
  activeOffers: number;
  rows: JobPipelineCandidateRow[];
};
