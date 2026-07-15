import { extractTextFromBuffer } from "@/lib/ai/extract-jd";
import { getPool } from "@/lib/db/config/client";
import { getJobEvaluateTemplate } from "@/lib/db/job-permissions";
import { downloadObject } from "@/lib/storage/s3";

/**
 * Best-effort plain text for a job's evaluation-criteria template
 * (`job_evaluate_templates`) -- plain text if saved directly, or extracted
 * from the uploaded file. Distinct from `resolveJobDescriptionText`: this is
 * the hiring-manager-defined criteria/rubric, not the JD document itself.
 */
export async function resolveJobEvaluationCriteriaText(jobId: string): Promise<string | null> {
  const template = await getJobEvaluateTemplate(getPool(), jobId);
  if (!template) return null;

  if (template.content_text?.trim()) {
    return template.content_text.trim();
  }

  if (template.storage_path) {
    try {
      const buf = await downloadObject(template.storage_path);
      const text = await extractTextFromBuffer(buf, template.mime_type || "application/pdf");
      return text.trim() || null;
    } catch {
      return null;
    }
  }

  return null;
}
