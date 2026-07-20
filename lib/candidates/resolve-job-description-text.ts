import { extractTextFromBuffer } from "@/lib/ai/extract-jd";
import { extensionFromFilename } from "@/lib/jd/upload-constants";
import { getPool } from "@/lib/db/config/client";
import { getJobById, type JobRow } from "@/lib/db/jobs";
import { downloadObject } from "@/lib/storage/s3";

function mimeFromJdFilename(filename: string | null | undefined): string {
  const ext = filename ? extensionFromFilename(filename) : null;
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "text/plain";
}

function structuredJdToText(row: JobRow): string {
  const parts: string[] = [];
  const push = (label: string, v: unknown) => {
    if (typeof v === "string" && v.trim()) {
      parts.push(`${label}:\n${v.trim()}`);
    }
  };
  push("Position", row.position);
  push("Department", row.department);
  push("Employment type", row.employment_status);
  push("Work location", row.work_location);
  push("Reporting", row.reporting);
  push("Role overview", row.role_overview);
  push("Duties and responsibilities", row.duties_and_responsibilities);
  push("Experience requirements (must-have)", row.experience_requirements_must_have);
  push("Experience requirements (nice-to-have)", row.experience_requirements_nice_to_have);
  push("What we offer", row.what_we_offer);
  return parts.join("\n\n").trim();
}

/**
 * Best-effort plain text for the job's JD (structured row and/or uploaded file).
 */
export async function resolveJobDescriptionText(jobId: string): Promise<string | null> {
  const job = await getJobById(getPool(), jobId);
  if (!job) return null;

  const chunks: string[] = [];

  const structuredText = structuredJdToText(job);
  if (structuredText) {
    chunks.push(structuredText);
  }

  if (job.jd_storage_path) {
    try {
      const buf = await downloadObject(job.jd_storage_path);
      const mime =
        job.jd_mime_type?.trim()
          ? job.jd_mime_type
          : mimeFromJdFilename(job.jd_original_filename);

      const raw = await extractTextFromBuffer(buf, mime);
      if (raw.trim()) {
        chunks.push(raw.trim());
      }
    } catch {
      // Best-effort download/extract; fall back to structured text
    }
  }

  const merged = chunks.join("\n\n---\n\n").trim();
  return merged.length > 0 ? merged : null;
}
