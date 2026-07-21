import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requireCanCreateJobs } from "@/lib/authz/require-permission";
import { extractJdFromDocument } from "@/lib/ai/extract-jd";
import {
  extractTextFromBuffer,
  looksLikePdfBinary,
} from "@/lib/jd/extract-document-text";
import { downloadJdFromStorage } from "@/lib/jd/download-jd-from-storage";

const JD_KEY_PREFIX = "jd/";

function isJdKey(key: string): boolean {
  return key.startsWith(JD_KEY_PREFIX) && !key.includes("..");
}

/**
 * POST /api/admin/job-descriptions/extract
 *
 * Body: { storagePath: string }
 *
 * Downloads the just-uploaded JD file straight from S3 (no draft DB row
 * anymore -- the single-step create flow only persists a `jobs` row once the
 * form is actually submitted), extracts text, runs AI extraction, and
 * returns pre-filled form data.
 */
export async function POST(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const createAccess = requireCanCreateJobs(auth.access);
  if (!createAccess.ok) return createAccess.response;

  let body: { storagePath?: string };
  try {
    body = (await request.json()) as { storagePath?: string };
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { storagePath } = body;
  if (!storagePath || typeof storagePath !== "string" || !isJdKey(storagePath)) {
    return Response.json(
      { error: "storagePath is required." },
      { status: 400 },
    );
  }

  // ── 1. Download file ──
  const dl = await downloadJdFromStorage(storagePath);
  if ("error" in dl) {
    return Response.json({ error: dl.error }, { status: 500 });
  }
  const { buffer, mimeType } = dl;

  // ── 2. Extract raw text ──
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

  if (!text || text.length < 20 || looksLikePdfBinary(text)) {
    return Response.json(
      {
        error:
          "Could not extract readable text from the document. Try DOCX or TXT, or ensure the PDF has a text layer (not a scanned image).",
      },
      { status: 422 },
    );
  }

  // ── 3. Heuristic header + optional AI merge (always 200 with payload) ──
  const extracted = await extractJdFromDocument(text);
  return Response.json({ extracted });
}
