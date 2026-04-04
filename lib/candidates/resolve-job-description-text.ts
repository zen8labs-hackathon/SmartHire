import type { SupabaseClient } from "@supabase/supabase-js";

import { extractTextFromBuffer } from "@/lib/ai/extract-jd";
import { extensionFromFilename, JD_BUCKET } from "@/lib/jd/upload-constants";

function mimeFromJdFilename(filename: string | null | undefined): string {
  const ext = filename ? extensionFromFilename(filename) : null;
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "text/plain";
}

function structuredJdToText(row: Record<string, unknown>): string {
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
 * Best-effort plain text for the job opening’s JD (structured row and/or uploaded file).
 */
export async function resolveJobDescriptionText(
  supabase: SupabaseClient,
  jobOpeningId: string,
): Promise<string | null> {
  const { data: jo, error } = await supabase
    .from("job_openings")
    .select(
      "id, jd_storage_path, jd_original_filename, jd_mime_type, job_description_id",
    )
    .eq("id", jobOpeningId)
    .maybeSingle();

  if (error || !jo) {
    return null;
  }

  const chunks: string[] = [];

  if (jo.job_description_id != null) {
    const { data: jdRow } = await supabase
      .from("job_descriptions")
      .select(
        "position, department, employment_status, work_location, reporting, role_overview, duties_and_responsibilities, experience_requirements_must_have, experience_requirements_nice_to_have, what_we_offer",
      )
      .eq("id", jo.job_description_id)
      .maybeSingle();

    if (jdRow) {
      const t = structuredJdToText(jdRow as Record<string, unknown>);
      if (t) chunks.push(t);
    }
  }

  if (jo.jd_storage_path) {
    const { data: blob, error: dlErr } = await supabase.storage
      .from(JD_BUCKET)
      .download(jo.jd_storage_path);

    if (!dlErr && blob) {
      const ab = await blob.arrayBuffer();
      const buf = Buffer.from(ab);
      const mime =
        typeof jo.jd_mime_type === "string" && jo.jd_mime_type.trim()
          ? jo.jd_mime_type
          : mimeFromJdFilename(jo.jd_original_filename as string | null);
      const raw = await extractTextFromBuffer(buf, mime);
      if (raw.trim()) {
        chunks.push(raw.trim());
      }
    }
  }

  const merged = chunks.join("\n\n---\n\n").trim();
  return merged.length > 0 ? merged : null;
}
