import type { CandidateRow, CandidateStatus } from "@/lib/candidates/types";
import { formatCandidateSourceLabel } from "@/lib/candidates/source-constants";

export type ParsingStatus = "pending" | "processing" | "completed" | "failed";

export type CandidateDbRow = {
  id: string;
  job_opening_id: string | null;
  cv_storage_path: string;
  original_filename: string;
  mime_type: string | null;
  parsing_status: ParsingStatus;
  parsing_error: string | null;
  parsed_payload: unknown;
  name: string | null;
  role: string | null;
  avatar_url: string | null;
  experience_years: number | string | null;
  skills: string[] | null;
  degree: string | null;
  school: string | null;
  status: string;
  chapter: string;
  source: string;
  source_other: string | null;
  created_at: string;
  updated_at: string;
};

function asCandidateStatus(s: string): CandidateStatus {
  if (s === "Shortlisted" || s === "Interviewing") return s;
  return "New";
}

export function candidateDbRowToTableRow(r: CandidateDbRow): CandidateRow {
  const skills = r.skills ?? [];
  const visible = skills.slice(0, 3);
  const more = skills.length > 3 ? skills.length - 3 : undefined;
  const exp =
    r.experience_years == null || r.experience_years === ""
      ? 0
      : Number(r.experience_years);

  const parsing = r.parsing_status;
  const name =
    parsing === "completed" && r.name?.trim()
      ? r.name.trim()
      : parsing === "failed"
        ? `Failed: ${r.original_filename}`
        : parsing === "processing" || parsing === "pending"
          ? `Processing: ${r.original_filename}`
          : r.name?.trim() || r.original_filename;

  const role =
    parsing === "completed" && r.role?.trim()
      ? r.role.trim()
      : parsing === "failed"
        ? (r.parsing_error ?? "Parse error").slice(0, 80)
        : "CV ingest";

  const sourceLabel = formatCandidateSourceLabel(
    r.source ?? "Other",
    r.source_other,
  );

  return {
    id: r.id,
    name,
    role,
    avatarUrl: r.avatar_url,
    experienceYears: Number.isFinite(exp) ? exp : 0,
    skills: visible,
    moreSkills: more,
    degree: r.degree?.trim() || "—",
    school: r.school?.trim() || "—",
    status: asCandidateStatus(r.status),
    chapter: r.chapter,
    sourceLabel,
  };
}
