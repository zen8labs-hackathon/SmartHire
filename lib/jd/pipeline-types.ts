export type JobPipelineCandidateRow = {
  /** `campaign_applied.id` (an application, not a person). */
  id: string;
  name: string;
  dateOfBirth: string;
  mobile: string;
  email: string;
  studentYears: string;
  majorSchool: string;
  gpa: string;
  english: string;
  relatedSkills: string;
  /** Current pipeline position, for the badge on the candidate-details card. `null` when the application has no stage assigned yet. */
  stageLabel: string | null;
  stageColor: string | null;
  subStageLabel: string | null;
  subStageCode: string | null;
  subStageIsPassed: boolean | null;
  /** Only populated server-side when the viewer is HR/admin or a chapter head. */
  expectedSalary: string | null;
};
