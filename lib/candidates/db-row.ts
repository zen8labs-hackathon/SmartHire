import type { CandidateRow, CandidateStatus } from "@/lib/candidates/types";
import { CANDIDATE_PIPELINE_STATUSES } from "@/lib/candidates/types";
import { formatCandidateSourceLabel } from "@/lib/candidates/source-constants";
import { displayFromParsedPayload } from "./parsed-contact";

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
  created_at?: string | null;
  job_descriptions: { id?: number; position: string } | { id?: number; position: string }[] | null;
};

export type CandidateDbRow = {
  id: string;
  /** False when this row was superseded by a newer CV upload (same person). */
  is_active?: boolean;
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
  /* TODO: LEGACY CODE - To be removed when migrating old features */
  status: string;
  uploaded_by_email?: string | null;
  source: string;
  source_other: string | null;
  jd_match_score?: number | null;
  jd_match_status?: JdMatchStatus | string | null;
  jd_match_error?: string | null;
  jd_match_rationale?: string | null;
  interview_at?: string | null;
  onboarding_at?: string | null;
  offered_at?: string | null;
  cv_uploaded_at?: string | null;
  current_job_stage_mapping_id?: string | null;
  current_sub_state_id?: string | null;
  pipeline_status?: string | null;
  /** SHA-256 hex of raw file bytes; set by process-cv after download. */
  cv_file_sha256?: string | null;
  /** SHA-256 hex of normalized plain text; set by process-cv after extract. */
  cv_content_sha256?: string | null;
  created_at: string;
  updated_at: string;
  /** Monotonic counter for profile edits / restores on this row. */
  cv_detail_version?: number;
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

/* TODO: LEGACY CODE - To be removed when migrating old features */
const LEGACY_STATUS_MAP: Record<string, CandidateStatus> = {
  Shortlisted: "CvPassed",
  Interviewing: "Interview",
  Failed: "CvFailed",
};

/* TODO: LEGACY CODE - To be removed when migrating old features */
const ALLOWED_PIPELINE_STATUSES = new Set<string>(CANDIDATE_PIPELINE_STATUSES);

/**
 * Maps DB `candidates.status` to the current pipeline enum (incl. legacy strings).
 * Returns null if the value is not recognized — use for API transition checks.
 */
/* TODO: LEGACY CODE - To be removed when migrating old features */
export function canonicalCandidateStatusFromDb(
  raw: string,
): CandidateStatus | null {
  const s = raw.trim();
  const mapped = LEGACY_STATUS_MAP[s];
  if (mapped) return mapped;
  if (ALLOWED_PIPELINE_STATUSES.has(s)) return s as CandidateStatus;
  const lowered = s.toLowerCase();
  if (lowered === "shortlisted") return "CvPassed";
  if (lowered === "interviewing") return "Interview";
  if (lowered === "failed") return "CvFailed";
  return null;
}

/** Coerce DB `candidates.status` string to the pipeline enum (defaults to New). */
/* TODO: LEGACY CODE - To be removed when migrating old features */
export function asCandidateStatus(s: string): CandidateStatus {
  return canonicalCandidateStatusFromDb(s) ?? "New";
}

function jdMatchLabelFromRow(r: CandidateDbRow): {
  score: number | null;
  label: string;
} {
  const st = (r.jd_match_status ?? "pending") as JdMatchStatus;
  const sc = r.jd_match_score == null ? null : Number(r.jd_match_score);
  if (st === "completed" && sc != null && Number.isFinite(sc)) {
    return { score: sc, label: String(Math.round(sc)) };
  }
  if (st === "processing") return { score: null, label: "Scoring…" };
  if (st === "failed") return { score: null, label: "Error" };
  if (st === "skipped") return { score: null, label: "N/A" };
  return { score: null, label: "Pending" };
}

function calculateDaysDifference(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): string | null {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const diffTime = end - start;
  if (diffTime < 0) return "0d";
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return `${diffDays}d`;
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

  const parsedData = displayFromParsedPayload(r.parsed_payload);

  const { score: jdMatchScore, label: jdMatchLabel } = jdMatchLabelFromRow(r);

  const uploaded = r.cv_uploaded_at?.trim() || r.created_at || null;

  const rawOpening = r.job_openings;
  const jo = rawOpening
    ? Array.isArray(rawOpening)
      ? rawOpening[0]
      : rawOpening
    : null;
  const openingCreatedAt = jo?.created_at;

  const ttf = calculateDaysDifference(openingCreatedAt, r.offered_at);
  const tth = calculateDaysDifference(uploaded, r.offered_at);

  return {
    id: r.id,
    hasCvFile: Boolean(r.cv_storage_path?.trim()),
    name,
    role,
    email: (r.parsed_payload as any)?.email,
    phone: (r.parsed_payload as any)?.phone,
    avatarUrl: r.avatar_url,
    experienceYears: Number.isFinite(exp) ? exp : 0,
    skills: visible,
    moreSkills: more,
    gpa: parsedData.gpa,
    englishLevel: parsedData.englishLevel,
    degree: r.degree?.trim() || "—",
    school: r.school?.trim() || "—",
    status: asCandidateStatus(r.status),
    uploadedByEmail: r.uploaded_by_email?.trim() || null,
    jobOpeningId: r.job_opening_id,
    jdCampaignLabel: jdCampaignLabelFromRow(r),
    sourceLabel,
    jdMatchScore,
    jdMatchLabel,
    jdMatchRationale: r.jd_match_rationale?.trim() || null,
    jdMatchError: r.jd_match_error?.trim() || null,
    cvUploadedAtIso: uploaded,
    ttf,
    tth,
  };
}
