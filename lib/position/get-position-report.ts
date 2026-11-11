import type { QueryExecutor } from "@/lib/db/config/client";
import { getJobById } from "@/lib/db/jobs";
import { listAllowedChaptersForJobs } from "@/lib/db/job-permissions";
import { dbDateToIso } from "@/lib/db/query-helpers";
import {
  fetchJobPipelineConfig,
  resolveCandidatePipelineIds,
} from "@/lib/pipelines/transition-validator";
import { applicationStoppedSql } from "./application-state";
import { getCurrentStageSummaries } from "./current-stage-summary";
import { jobToPositionStatus } from "./list-with-enrichment";
import { matchStatusToScoring } from "./list-position-candidates";

type ApplicationRow = {
  id: string;
  candidate_id: string;
  name: string | null;
  source: string;
  source_other: string | null;
  created_at: Date;
  hired_at: Date | null;
  current_job_stage_mapping_id: string | null;
  current_sub_state_id: string | null;
  stopped: boolean;
  score: number | null;
  scoring_status: string | null;
};

type HistoryRow = {
  id: string;
  application_id: string;
  candidate_name: string | null;
  at: Date;
  from_stage: string | null;
  to_stage: string | null;
  from_sub_stage: string | null;
  to_sub_stage: string | null;
  actor: string | null;
  reason: string | null;
};

export async function getPositionReport(
  db: QueryExecutor,
  jobId: string,
) {
  const job = await getJobById(db, jobId);

  if (!job) return null;

  const generatedAt = new Date().toISOString();

  const [
    chaptersByJob,
    summaries,
    config,
    applicationResult,
    historyResult,
  ] = await Promise.all([
    listAllowedChaptersForJobs(db, [jobId]),

    getCurrentStageSummaries(db, [jobId]),

    fetchJobPipelineConfig(db, jobId),

    db.query<ApplicationRow>(
      `SELECT
         ca.id,
         ca.candidate_id,
         c.name,
         ca.source,
         ca.source_other,
         ca.created_at,
         ca.hired_at,
         ca.current_job_stage_mapping_id,
         ca.current_sub_state_id,
         ${applicationStoppedSql()} AS stopped,
         cv.jd_match_score AS score,
         cv.jd_match_status AS scoring_status
       FROM campaign_applied ca
       JOIN candidates c
         ON c.id = ca.candidate_id
        AND c.deleted_at IS NULL
       LEFT JOIN cv_detail_versions cv
         ON cv.id = ca.active_cv_version_id
       WHERE ca.job_id = $1::uuid
         AND ca.deleted_at IS NULL
       ORDER BY ca.created_at ASC, ca.id ASC`,
      [jobId],
    ),

    db.query<HistoryRow>(
      `SELECT
         h.id::text AS id,
         ca.id AS application_id,
         c.name AS candidate_name,
         h.at,
         COALESCE(
           fs.label,
           h.from_stage_mapping_id::text
         ) AS from_stage,
         COALESCE(
           ts.label,
           h.to_stage_mapping_id::text
         ) AS to_stage,
         COALESCE(
           fsub.label,
           h.from_sub_state_id::text
         ) AS from_sub_stage,
         COALESCE(
           tsub.label,
           h.to_sub_state_id::text
         ) AS to_sub_stage,
         u.username AS actor,
         h.reason
       FROM candidate_stage_history h
       JOIN campaign_applied ca
         ON ca.id = h.campaign_applied_id
        AND ca.deleted_at IS NULL
       JOIN candidates c
         ON c.id = ca.candidate_id
        AND c.deleted_at IS NULL
       LEFT JOIN job_stage_mappings fm
         ON fm.id = h.from_stage_mapping_id
       LEFT JOIN pipeline_stages fs
         ON fs.id = fm.pipeline_stage_id
       LEFT JOIN job_stage_mappings tm
         ON tm.id = h.to_stage_mapping_id
       LEFT JOIN pipeline_stages ts
         ON ts.id = tm.pipeline_stage_id
       LEFT JOIN pipeline_sub_stages fsub
         ON fsub.id = h.from_sub_state_id
       LEFT JOIN pipeline_sub_stages tsub
         ON tsub.id = h.to_sub_state_id
       LEFT JOIN users u
         ON u.id = h.by_user_id
       WHERE ca.job_id = $1::uuid
         AND (
           h.from_stage_mapping_id
             IS DISTINCT FROM h.to_stage_mapping_id
           OR h.from_sub_state_id
             IS DISTINCT FROM h.to_sub_state_id
         )
       ORDER BY h.at ASC, h.id ASC`,
      [jobId],
    ),
  ]);

  const summary = summaries.get(jobId);

  if (!summary) {
    throw new Error("Missing stage summary for position report.");
  }

  const applications = applicationResult.rows.map((row) => {
    const resolved = resolveCandidatePipelineIds(
      row,
      config.stageMappings,
      config.subStages,
    );

    const mapping = config.stageMappings.find(
      (item) => item.id === resolved.stageMappingId,
    );

    const subStage = config.subStages.find(
      (item) => item.id === resolved.subStateId,
    );

    const scoring = matchStatusToScoring(
      row.scoring_status,
      row.score,
    );

    return {
      id: row.id,
      candidateId: row.candidate_id,
      name: row.name ?? "Unnamed candidate",
      source:
        row.source === "Other" && row.source_other
          ? row.source_other
          : row.source,
      appliedAt: row.created_at.toISOString(),
      hiredAt: row.hired_at?.toISOString() ?? null,
      stageMappingId: resolved.stageMappingId,
      stage: mapping?.pipeline_stages?.label ?? "Unassigned",
      subStage: subStage?.label ?? "—",
      stopped: row.stopped,
      scoring,
      score: scoring === "done" ? row.score : null,
    };
  });

  const history = historyResult.rows.map((row) => ({
    id: row.id,
    applicationId: row.application_id,
    candidateName: row.candidate_name ?? "Unnamed candidate",
    at: row.at.toISOString(),
    fromStage: row.from_stage ?? "—",
    fromSubStage: row.from_sub_stage ?? "—",
    toStage: row.to_stage ?? "—",
    toSubStage: row.to_sub_stage ?? "—",
    actor: row.actor ?? "Unknown / system",
    reason: row.reason,
  }));

  return {
    generatedAt,
    position: {
      id: job.id,
      title: job.position,
      status: jobToPositionStatus(job),
      chapters: chaptersByJob.get(jobId) ?? [],
      headcount: job.headcount,
      hired: applications.filter((item) => item.hiredAt !== null).length,
      deadline: dbDateToIso(job.hiring_deadline),
    },
    summary,
    applications,
    history,
  };
}

export type PositionReport = NonNullable<
  Awaited<ReturnType<typeof getPositionReport>>
>;
