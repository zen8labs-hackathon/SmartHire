import { getPool, type QueryExecutor } from "@/lib/db/config/client";
import { getJobById, updateJob, type UpdateJobInput } from "@/lib/db/jobs";
import { createNotification, NOTIFICATION_TYPE } from "@/lib/db/notifications";
import { extractJdFromDocument } from "@/lib/ai/extract-jd";
import { downloadJdFromStorage } from "@/lib/jd/download-jd-from-storage";
import {
  extractTextFromBuffer,
  looksLikePdfBinary,
} from "@/lib/jd/extract-document-text";
import { extractedApiToFormPatch } from "@/lib/jd/extracted-to-form";
import { syncJobRequirementsQuietly } from "@/lib/jd/sync-job-requirements";
import { failureNote } from "@/lib/position/jd-state";
import { logApiError } from "@/lib/logger";

export const UNREADABLE_JD_ERROR =
  "Could not extract readable text from the document. Try DOCX or TXT, or ensure the PDF has a text layer (not a scanned image).";

/** Snake_case extraction patch -> camelCase job update. */
export function patchToJobUpdate(
  patch: Record<string, unknown>,
): { update: UpdateJobInput; filled: number } {
  const map: Record<string, keyof UpdateJobInput> = {
    position: "position",
    department: "department",
    work_location: "workLocation",
    reporting: "reporting",
    role_overview: "roleOverview",
    duties_and_responsibilities: "dutiesAndResponsibilities",
    experience_requirements_must_have: "experienceRequirementsMustHave",
    experience_requirements_nice_to_have: "experienceRequirementsNiceToHave",
    what_we_offer: "whatWeOffer",
    language_requirements: "languageRequirements",
    project_info: "projectInfo",
    team_size: "teamSize",
    salary_range: "salaryRange",
  };
  // `update_note` is skipped too: it carries the Draft marker.
  // `employment_status` is intentionally skipped: the type chosen in the
  // dialog is authoritative (BR-02-29).
  const update: Record<string, unknown> = {};
  let filled = 0;
  for (const [key, field] of Object.entries(map)) {
    const v = patch[key];
    if (typeof v === "string" && v.trim()) {
      update[field] = v;
      filled += 1;
    }
  }
  return { update: update as UpdateJobInput, filled };
}

export async function recipientIds(
  db: QueryExecutor,
  jobId: string,
  creatorId: string | null,
): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM users WHERE role = 'hr' AND deleted_at IS NULL
     UNION
     SELECT pc.profile_id FROM profile_chapters pc
       JOIN job_allowed_chapters jc ON jc.chapter_id = pc.chapter_id
      WHERE jc.job_id = $1 AND pc.role = 'head'`,
    [jobId],
  );
  const ids = new Set(rows.map((r) => r.id));
  if (creatorId) ids.add(creatorId);
  return [...ids];
}

async function notify(
  db: QueryExecutor,
  jobId: string,
  title: string,
  ok: boolean,
  body: string,
  creatorId: string | null,
) {
  const ids = await recipientIds(db, jobId, creatorId);
  await Promise.all(
    ids.map((userId) =>
      createNotification(db, {
        userId,
        type: ok
          ? NOTIFICATION_TYPE.JdProcessed
          : NOTIFICATION_TYPE.JdProcessFailed,
        title,
        body,
        data: { jobId },
      }).catch((e) => logApiError("JD notification failed", e)),
    ),
  );
}

/**
 * Background JD processing for a Draft position: extract text, fill fields,
 * mark done/failed and notify. Never throws; the position stays Draft.
 */
export async function processPositionJd(jobId: string): Promise<void> {
  const db = getPool();
  let creatorId: string | null = null;
  let title = "Position";
  try {
    const job = await getJobById(db, jobId);
    if (!job) return;
    creatorId = job.created_by;
    title = job.position;
    if (!job.jd_storage_path) throw new Error("Position has no JD file.");

    const file = await downloadJdFromStorage(job.jd_storage_path);
    if ("error" in file) throw new Error(file.error);

    const text = await extractTextFromBuffer(file.buffer, file.mimeType);
    if (!text || text.length < 20 || looksLikePdfBinary(text)) {
      throw new Error(UNREADABLE_JD_ERROR);
    }

    const extracted = await extractJdFromDocument(text);
    const { update, filled } = patchToJobUpdate(
      {
        ...extractedApiToFormPatch(extracted),
        language_requirements: extracted.language_requirements,
        project_info: extracted.project_info,
        team_size: extracted.team_size?.slice(0, 100),
        salary_range: extracted.salary_range?.slice(0, 100),
      } as Record<string, unknown>,
    );
    if (
      !update.roleOverview &&
      !update.dutiesAndResponsibilities &&
      !update.experienceRequirementsMustHave
    ) {
      throw new Error("No position details could be extracted from the JD.");
    }
    await updateJob(db, jobId, update);
    await syncJobRequirementsQuietly(jobId);

    const finalTitle = update.position ?? title;
    await notify(
      db,
      jobId,
      "JD processed",
      true,
      `${finalTitle}: ${filled} fields filled from the JD. Review before opening.`,
      creatorId,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "JD processing failed.";
    logApiError("Position JD processing failed", e);
    await updateJob(db, jobId, { updateNote: failureNote(message) }).catch(() => {});
    await notify(
      db,
      jobId,
      "JD processing failed",
      false,
      `${title}: ${message}`,
      creatorId,
    ).catch(() => {});
  }
}
