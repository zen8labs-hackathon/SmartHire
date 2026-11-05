import type { QueryExecutor } from "@/lib/db/config/client";
import { activeCooldown } from "@/lib/candidates/cooldown";

export type Candidate2DetailRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  degree: string | null;
  education: string | null;
  role: string | null;
  experience_years: string | null;
  skills: string[] | null;
  tags: string[] | null;
  rehire_status: "eligible" | "ask" | "not_eligible" | null;
  rehire_reason: string | null;
  rehire_by: string | null;
  rehire_by_name: string | null;
  rehire_at: string | null;
  consent_date: string | null;
  consent_channel: string | null;
  consent_recorded_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  english_level: string | null;
  date_of_birth: string | null;
  source: string | null;
  source_other: string | null;
};

export type Candidate2AppRow = {
  id: string;
  job_id: string | null;
  title: string | null;
  job_status: string | null;
  stage: string | null;
  sub: string | null;
  hired_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
  end_note: string | null;
  score: number | null;
  score_status: string | null;
  active_cv_version_id: string | null;
  created_at: string | null;
};

export type Candidate2CvRow = {
  id: string;
  campaign_applied_id: string;
  version_number: number;
  source_event: string;
  cv_storage_path: string | null;
  original_filename: string | null;
  cv_file_sha256: string | null;
  parsing_status: string | null;
  parsing_error: string | null;
  matched_on: string | null;
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
};

/** Experience state derived from CV versions: HR's manual value vs the AI/CV-parsed one. */
export type Candidate2ExpState = {
  manual: { years: number; by: string | null; at: string; reason: string | null } | null;
  /** Experience parsed by AI before the manual edit (fallback: newest parsed). */
  ai: number | null;
  /** A CV uploaded after the manual edit whose parsed experience differs. */
  conflict: { years: number; file: string } | null;
  /** Newest parsed value, used by "use CV". */
  latestParsed: number | null;
};

export type Candidate2TimelineRow = {
  id: string;
  campaign_applied_id: string | null;
  type: string;
  title: string;
  detail: string | null;
  by_name: string | null;
  at: string;
};

export type Candidate2Detail = {
  candidate: Candidate2DetailRow;
  timeline: Candidate2TimelineRow[];
  /** Ended application inside the cooldown window while another is open (BR-06). */
  cooldownApplicationId: string | null;
  applications: Candidate2AppRow[];
  cvs: Candidate2CvRow[];
  expState: Candidate2ExpState;
};

type ExpVersionRow = {
  source_event: string;
  experience_years: string | null;
  original_filename: string | null;
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
};

export function deriveExpState(rows: ExpVersionRow[]): Candidate2ExpState {
  // rows are newest first
  const isParsed = (r: ExpVersionRow) =>
    (r.source_event === "initial_upload" || r.source_event === "file_replaced") &&
    r.experience_years != null;
  const num = (v: string | null) => (v == null ? null : Number(v));
  const newestParsed = rows.find(isParsed) ?? null;
  const manual = rows.find((r) => r.source_event === "manual_edit" && r.experience_years != null) ?? null;
  if (!manual) {
    return { manual: null, ai: num(newestParsed?.experience_years ?? null), conflict: null, latestParsed: num(newestParsed?.experience_years ?? null) };
  }
  const manualAt = new Date(manual.created_at).getTime();
  const aiRow = rows.find((r) => isParsed(r) && new Date(r.created_at).getTime() <= manualAt) ?? newestParsed;
  const manualYears = Number(manual.experience_years);
  const ai = num(aiRow?.experience_years ?? null);
  const newer = newestParsed && new Date(newestParsed.created_at).getTime() > manualAt ? newestParsed : null;
  const conflict =
    newer && Number(newer.experience_years) !== manualYears
      ? { years: Number(newer.experience_years), file: newer.original_filename ?? "CV" }
      : null;
  return {
    manual: ai === manualYears ? null : { years: manualYears, by: manual.created_by, at: manual.created_at, reason: manual.change_summary },
    ai,
    conflict,
    latestParsed: num(newestParsed?.experience_years ?? null),
  };
}

export async function getCandidate2Detail(
  db: QueryExecutor,
  id: string,
): Promise<Candidate2Detail | null> {
  const { rows } = await db.query<Candidate2DetailRow>(
    `SELECT c.id, c.name, c.email, c.phone, c.degree, c.education, c.role,
            c.experience_years, c.skills, c.tags,
            c.rehire_status, c.rehire_reason, c.rehire_by, ru.username AS rehire_by_name, c.rehire_at,
            c.consent_date, c.consent_channel, c.consent_recorded_by,
            c.created_at, c.updated_at,
            cv.english_level, cv.date_of_birth,
            la.source, la.source_other
       FROM candidates c
       LEFT JOIN users ru ON ru.id = c.rehire_by
       LEFT JOIN LATERAL (
         SELECT v.english_level, v.date_of_birth
           FROM cv_detail_versions v
           JOIN campaign_applied ca ON ca.id = v.campaign_applied_id
          WHERE ca.candidate_id = c.id AND ca.deleted_at IS NULL
          ORDER BY v.created_at DESC, v.version_number DESC, v.id DESC
          LIMIT 1
       ) cv ON true
       LEFT JOIN LATERAL (
         SELECT ca.source, ca.source_other
           FROM campaign_applied ca
          WHERE ca.candidate_id = c.id AND ca.deleted_at IS NULL
          ORDER BY ca.created_at DESC, ca.id DESC
          LIMIT 1
       ) la ON true
      WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [id],
  );
  const candidate = rows[0];
  if (!candidate) return null;

  const apps = await db.query<Candidate2AppRow>(
    `SELECT ca.id, ca.job_id, j.position AS title, j.status AS job_status,
            ps.label AS stage, pss.label AS sub,
            ca.hired_at, ca.ended_at, ca.end_reason, ca.end_note,
            ca.jd_match_score AS score, ca.jd_match_status AS score_status,
            ca.active_cv_version_id, ca.created_at
       FROM campaign_applied ca
       LEFT JOIN jobs j ON j.id = ca.job_id AND j.deleted_at IS NULL
       LEFT JOIN job_stage_mappings jsm ON jsm.id = ca.current_job_stage_mapping_id
       LEFT JOIN pipeline_stages ps ON ps.id = jsm.pipeline_stage_id
       LEFT JOIN pipeline_sub_stages pss ON pss.id = ca.current_sub_state_id
      WHERE ca.candidate_id = $1 AND ca.deleted_at IS NULL
      ORDER BY ca.created_at DESC, ca.id DESC`,
    [id],
  );

  const cvs = await db.query<Candidate2CvRow>(
    `SELECT v.id, v.campaign_applied_id, v.version_number, v.source_event,
            v.cv_storage_path, v.original_filename, v.cv_file_sha256,
            v.parsing_status, v.parsing_error, v.matched_on,
            v.change_summary, v.created_by, v.created_at
       FROM cv_detail_versions v
       JOIN campaign_applied ca ON ca.id = v.campaign_applied_id
      WHERE ca.candidate_id = $1 AND ca.deleted_at IS NULL
      ORDER BY v.created_at DESC, v.version_number DESC, v.id DESC`,
    [id],
  );

  const exp = await db.query<ExpVersionRow>(
    `SELECT v.source_event, v.experience_years, v.original_filename,
            v.change_summary, v.created_by, v.created_at
       FROM cv_detail_versions v
       JOIN campaign_applied ca ON ca.id = v.campaign_applied_id
      WHERE ca.candidate_id = $1 AND ca.deleted_at IS NULL
      ORDER BY v.created_at DESC, v.version_number DESC, v.id DESC`,
    [id],
  );

  const timeline = await db.query<Candidate2TimelineRow>(
    `SELECT t.id, t.campaign_applied_id, t.type, t.title, t.detail,
            u.username AS by_name, t.at
       FROM candidate_timeline_events t
       LEFT JOIN users u ON u.id = t.by_user_id
      WHERE t.candidate_id = $1
      ORDER BY t.at DESC, t.id DESC`,
    [id],
  );

  return {
    candidate,
    timeline: timeline.rows,
    cooldownApplicationId: activeCooldown(apps.rows)?.id ?? null,
    applications: apps.rows,
    cvs: cvs.rows,
    expState: deriveExpState(exp.rows),
  };
}

/** True when the CV version belongs to one of the candidate's live applications. */
export async function cvBelongsToCandidate(
  db: QueryExecutor,
  candidateId: string,
  versionId: string,
): Promise<{ cv_storage_path: string | null; original_filename: string | null; mime_type: string | null } | null> {
  const { rows } = await db.query<{
    cv_storage_path: string | null;
    original_filename: string | null;
    mime_type: string | null;
  }>(
    `SELECT v.cv_storage_path, v.original_filename, v.mime_type
       FROM cv_detail_versions v
       JOIN campaign_applied ca ON ca.id = v.campaign_applied_id
      WHERE v.id = $1 AND ca.candidate_id = $2 AND ca.deleted_at IS NULL`,
    [versionId, candidateId],
  );
  return rows[0] ?? null;
}
