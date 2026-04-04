import type { CandidateRow, CandidateStatus } from "@/lib/candidates/types";
import { formatCandidateSourceLabel } from "@/lib/candidates/source-constants";

export type ParsingStatus = "pending" | "processing" | "completed" | "failed";

export type JdMatchStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "skipped";

/** Embedded row from Supabase when selecting job_openings on candidates */
export type JobOpeningEmbed = {
  id: string;
  title: string;
  job_descriptions:
    | { position: string }
    | { position: string }[]
    | null;
};

export type CandidateDbRow = {
  id: string;
  job_opening_id: string | null;
  job_openings?: JobOpeningEmbed | JobOpeningEmbed[] | null;
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
  jd_match_score?: number | null;
  jd_match_status?: JdMatchStatus | string | null;
  jd_match_error?: string | null;
  jd_match_rationale?: string | null;
  interview_at?: string | null;
  onboarding_at?: string | null;
  cv_uploaded_at?: string | null;
  created_at: string;
  updated_at: string;
};

function positionFromJdEmbed(
  embed: JobOpeningEmbed["job_descriptions"],
): string | undefined {
  if (embed == null) return undefined;
  const row = Array.isArray(embed) ? embed[0] : embed;
  return row?.position?.trim() || undefined;
}

function jdCampaignLabelFromRow(r: CandidateDbRow): string {
  const raw = r.job_openings;
  if (raw == null) {
    return r.job_opening_id ? "—" : "Unassigned";
  }
  const jo = Array.isArray(raw) ? raw[0] : raw;
  if (!jo) return "Unassigned";
  const pos = positionFromJdEmbed(jo.job_descriptions);
  if (pos) return pos;
  return jo.title?.trim() || "—";
}

function asCandidateStatus(s: string): CandidateStatus {
  if (s === "Shortlisted" || s === "Interviewing") return s;
  if (s === "Offer") return "Offer";
  if (s === "Failed") return "Failed";
  return "New";
}

function jdMatchLabelFromRow(r: CandidateDbRow): {
  score: number | null;
  label: string;
} {
  const st = (r.jd_match_status ?? "pending") as JdMatchStatus;
  const sc =
    r.jd_match_score == null ? null : Number(r.jd_match_score);
  if (st === "completed" && sc != null && Number.isFinite(sc)) {
    return { score: sc, label: String(Math.round(sc)) };
  }
  if (st === "processing") return { score: null, label: "Scoring…" };
  if (st === "failed") return { score: null, label: "Error" };
  if (st === "skipped") return { score: null, label: "N/A" };
  return { score: null, label: "Pending" };
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

  const { score: jdMatchScore, label: jdMatchLabel } = jdMatchLabelFromRow(r);

  return {
    id: r.id,
    hasCvFile: Boolean(r.cv_storage_path?.trim()),
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
    jobOpeningId: r.job_opening_id,
    jdCampaignLabel: jdCampaignLabelFromRow(r),
    sourceLabel,
    jdMatchScore,
    jdMatchLabel,
    jdMatchRationale: r.jd_match_rationale?.trim() || null,
    jdMatchError: r.jd_match_error?.trim() || null,
  };
}
