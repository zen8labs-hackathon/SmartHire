import type { CampaignAppliedRow } from "@/lib/db/campaign-applied";
import { getCandidateById } from "@/lib/db/candidates";
import { listCandidateSchedulesByCampaignApplied } from "@/lib/db/candidate-schedules";
import type { QueryExecutor } from "@/lib/db/config/client";
import { getJobById } from "@/lib/db/jobs";
import { getPipelineStageLabelForJobStageMapping } from "@/lib/db/pipeline-stages";
import { wrapEmailBodyInCard } from "@/lib/email/email-layout";
import { renderEmailSubjectAndBody } from "@/lib/email/render-template";
import { buildCandidateEmailVariables } from "@/lib/email/template-variables";

const FALLBACK_COMPANY_NAME = "SmartHire";

export type ComposedCandidateEmail = {
  campaignAppliedId: string;
  jobId: string | null;
  candidateName: string;
  toEmail: string | null;
  subject: string;
  bodyHtml: string;
};

export type ComposeEmailForCandidateOptions = {
  senderName?: string | null;
  companyName?: string | null;
  /** Appended to the rendered body -- the org-wide signature from `email_settings`. */
  signatureHtml?: string | null;
  /** Rendered in the card header in place of the company name text, when set. */
  logoUrl?: string | null;
  /** The staff account sending this email -- feeds the `user_name`/`user_email`/`user_phone` placeholders. Absent for auto/system sends. */
  senderUser?: { name?: string | null; email?: string | null; phone?: string | null } | null;
};

/**
 * Shared by the preview and send routes so both render subject/body the same
 * way: pull the candidate/job/most-recent-schedule for this application,
 * build the placeholder variables, and substitute them into the given
 * templates (which may be a saved template's text or a free-form
 * subject/body override -- either way placeholders still get filled, which
 * is what keeps bulk sends "personalized per recipient").
 */
export async function composeEmailForCandidate(
  db: QueryExecutor,
  application: CampaignAppliedRow,
  subjectTemplate: string,
  bodyTemplate: string,
  options: ComposeEmailForCandidateOptions = {},
): Promise<ComposedCandidateEmail | null> {
  const { senderName, companyName, signatureHtml, logoUrl, senderUser } = options;

  const candidate = await getCandidateById(db, application.candidate_id);
  if (!candidate) return null;

  const job = application.job_id
    ? await getJobById(db, application.job_id)
    : null;
  const schedules = await listCandidateSchedulesByCampaignApplied(
    db,
    application.id,
  );
  const pipelineStage = application.current_job_stage_mapping_id
    ? await getPipelineStageLabelForJobStageMapping(
        db,
        application.current_job_stage_mapping_id,
      )
    : null;

  const vars = buildCandidateEmailVariables({
    candidate,
    job,
    schedule: schedules[0] ?? null,
    senderName,
    companyName,
    senderUser,
    pipelineStage,
  });

  const { subject, bodyHtml } = renderEmailSubjectAndBody(
    subjectTemplate,
    bodyTemplate,
    vars,
  );

  const bodyWithSignature = signatureHtml ? `${bodyHtml}<br /><br />${signatureHtml}` : bodyHtml;

  return {
    campaignAppliedId: application.id,
    jobId: application.job_id,
    candidateName: candidate.name ?? candidate.email ?? "Candidate",
    toEmail: candidate.email,
    subject,
    bodyHtml: wrapEmailBodyInCard({
      bodyHtml: bodyWithSignature,
      companyName: companyName || FALLBACK_COMPANY_NAME,
      logoUrl,
    }),
  };
}
