import type { CvDetailVersionRow } from "@/lib/db/cv-detail-versions";

const DIFF_FIELDS = [
  "role",
  "degree",
  "education",
  "experience_years",
  "gpa",
  "english_level",
  "student_years",
] as const;

export type CvView = {
  id: string;
  versionNumber: number;
  sourceEvent: CvDetailVersionRow["source_event"];
  changeSummary: string | null;
  createdAt: string;
  createdBy: string | null;
  filename: string | null;
  mimeType: string | null;
  parsingStatus: string | null;
  parsingError: string | null;
  parsedPayload: unknown;
  fields: {
    role: string | null;
    degree: string | null;
    education: string | null;
    experienceYears: string | null;
    gpa: string | null;
    englishLevel: string | null;
    studentYears: string | null;
    dateOfBirth: string | null;
    skills: string[];
  };
  /** Field keys whose value differs from the previous version. */
  diff: string[];
};

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

/** Pure: shape one CV version row plus its predecessor into the API payload. */
export function buildCvView(
  v: CvDetailVersionRow,
  prev: CvDetailVersionRow | null,
): CvView {
  const diff: string[] = [];
  if (prev) {
    for (const f of DIFF_FIELDS) if ((v[f] ?? null) !== (prev[f] ?? null)) diff.push(f);
    if (!sameList(v.skills ?? [], prev.skills ?? [])) diff.push("skills");
  }
  return {
    id: v.id,
    versionNumber: v.version_number,
    sourceEvent: v.source_event,
    changeSummary: v.change_summary,
    createdAt: v.created_at.toISOString(),
    createdBy: v.created_by,
    filename: v.original_filename,
    mimeType: v.mime_type,
    parsingStatus: v.parsing_status,
    parsingError: v.parsing_error,
    parsedPayload: v.parsed_payload,
    fields: {
      role: v.role,
      degree: v.degree,
      education: v.education,
      experienceYears: v.experience_years,
      gpa: v.gpa,
      englishLevel: v.english_level,
      studentYears: v.student_years,
      dateOfBirth: v.date_of_birth ? v.date_of_birth.toISOString().slice(0, 10) : null,
      skills: v.skills ?? [],
    },
    diff,
  };
}
