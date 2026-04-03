import type { JobPipelineCandidateRow, JobPipelineViewModel } from "./pipeline-types";
import { JD_ROWS } from "./mock-data";

const MOCK_ROWS: JobPipelineCandidateRow[] = [
  {
    id: "c1",
    name: "Alex Rivera",
    verified: true,
    dateOfBirth: "12 Mar 1998",
    mobile: "+84 90 123 4567",
    email: "alex.rivera@email.com",
    studentYears: "2016 – 2020",
    majorSchool: "CS · FTU",
    gpa: "3.65 / 4.0",
    english: "IELTS 7.5",
    relatedSkills: "Figma, Design systems, UX research",
    status: "INTERVIEWING",
  },
  {
    id: "c2",
    name: "Minh Anh Nguyen",
    dateOfBirth: "02 Jan 1999",
    mobile: "+84 91 888 2211",
    email: "minhanh.ng@email.com",
    studentYears: "2017 – 2021",
    majorSchool: "Product Design · RMIT",
    gpa: "3.42 / 4.0",
    english: "TOEIC 880",
    relatedSkills: "Prototyping, Workshop facilitation",
    status: "CV SCREENING",
  },
  {
    id: "c3",
    name: "Jordan Lee",
    verified: true,
    dateOfBirth: "18 Sep 1997",
    mobile: "+84 93 400 9922",
    email: "jordan.lee@email.com",
    studentYears: "2015 – 2019",
    majorSchool: "HCI · UEH",
    gpa: "3.78 / 4.0",
    english: "IELTS 8.0",
    relatedSkills: "Research ops, Accessibility",
    status: "REJECTED",
  },
  {
    id: "c4",
    name: "Samira Patel",
    dateOfBirth: "30 Jul 2000",
    mobile: "+84 97 221 0099",
    email: "samira.patel@email.com",
    studentYears: "2018 – 2022",
    majorSchool: "Interaction Design · HCMUS",
    gpa: "3.55 / 4.0",
    english: "IELTS 7.0",
    relatedSkills: "Motion, Visual design",
    status: "OFFER",
  },
  {
    id: "c5",
    name: "Chris Wong",
    dateOfBirth: "05 Nov 1996",
    mobile: "+84 98 300 1144",
    email: "chris.wong@email.com",
    studentYears: "2014 – 2018",
    majorSchool: "Graphic Design · ULIS",
    gpa: "3.28 / 4.0",
    english: "TOEFL 102",
    relatedSkills: "Brand, Illustration",
    status: "NEW",
  },
];

export function getJobPipelineView(jobId: string): JobPipelineViewModel {
  const jd = JD_ROWS.find((r) => r.id === jobId);
  const jobTitle = jd?.jobTitle ?? "Job pipeline";
  const rows = MOCK_ROWS.map((r, i) => ({
    ...r,
    id: `${jobId}-${i}`,
  }));
  const activeOffers = rows.filter((r) => r.status === "OFFER").length;
  return {
    jobId,
    jobTitle,
    totalCandidates: rows.length,
    activeOffers,
    rows,
  };
}
