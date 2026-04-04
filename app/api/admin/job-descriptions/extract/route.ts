import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { extractTextFromBuffer, extractJdFromDocument } from "@/lib/ai/extract-jd";
import { downloadJdFromStorage } from "@/lib/jd/download-jd-from-storage";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/job-descriptions/extract
 *
 * Body: { jobOpeningId: string }
 *
 * Downloads the JD file attached to the draft job_openings row,
 * extracts text, runs AI extraction, and returns pre-filled form data.
 *
 * NOTE: Only selects columns that are guaranteed to exist (id, status,
 * jd_storage_path). MIME type is inferred from the file extension so this
 * route works even if the jd_mime_type column migration hasn't been applied yet.
 */
export async function POST(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  let body: { jobOpeningId?: string };
  try {
    body = (await request.json()) as { jobOpeningId?: string };
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { jobOpeningId } = body;
  if (!jobOpeningId || typeof jobOpeningId !== "string") {
    return Response.json(
      { error: "jobOpeningId is required." },
      { status: 400 },
    );
  }

  // ── 1. Fetch storage path (only base columns — avoids schema-cache errors) ──
  const { data: row, error: selErr } = await auth.supabase
    .from("job_openings")
    .select("id, jd_storage_path")
    .eq("id", jobOpeningId)
    .maybeSingle();

  if (selErr) {
    return Response.json({ error: selErr.message }, { status: 500 });
  }
  if (!row?.jd_storage_path) {
    return Response.json(
      { error: "No JD file found for this job opening." },
      { status: 404 },
    );
  }

  const storagePath: string = row.jd_storage_path as string;

  // ── 2. Download file (admin client bypasses Storage RLS) ──
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return Response.json(
      { error: "Server missing service role key." },
      { status: 500 },
    );
  }

  const dl = await downloadJdFromStorage(admin, storagePath);
  if ("error" in dl) {
    return Response.json({ error: dl.error }, { status: 500 });
  }
  const { buffer, mimeType } = dl;

  // ── 3. Extract raw text ──
  let text: string;
  try {
    text = await extractTextFromBuffer(buffer, mimeType);
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error
            ? `Text extraction failed: ${e.message}`
            : "Text extraction failed.",
      },
      { status: 500 },
    );
  }

  if (!text || text.length < 20) {
    return Response.json(
      { error: "Could not extract meaningful text from the document." },
      { status: 422 },
    );
  }

  // ── 4. Heuristic header + optional AI merge (always 200 with payload) ──
  const extracted = await extractJdFromDocument(text);
  return Response.json({ extracted });
}
