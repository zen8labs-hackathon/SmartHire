import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { getPool } from "@/lib/db/config/client";
import { cvBelongsToCandidate } from "@/lib/db/candidates-detail2";
import { logApiError } from "@/lib/logger";
import { createSignedDownloadUrl } from "@/lib/storage/s3";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const url = new URL(request.url);
  const versionId = url.searchParams.get("versionId")?.trim();
  if (!id || !UUID_RE.test(id) || !versionId || !/^\d+$/.test(versionId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const cv = await cvBelongsToCandidate(getPool(), id, versionId);
  if (!cv || !cv.cv_storage_path) {
    return Response.json({ error: "CV version file not found." }, { status: 404 });
  }
  const mimeType = cv.mime_type ?? "application/pdf";
  if (url.searchParams.get("meta") === "1") {
    return Response.json({ mimeType, filename: cv.original_filename });
  }

  try {
    const signedUrl = await createSignedDownloadUrl(cv.cv_storage_path, 120);
    if (url.searchParams.get("proxy") === "1") {
      const upstream = await fetch(signedUrl);
      if (!upstream.ok) {
        return Response.json({ error: "Failed to fetch file from storage." }, { status: 502 });
      }
      return new Response(upstream.body, {
        headers: { "Content-Type": mimeType, "Cache-Control": "private, max-age=300" },
      });
    }
    return Response.redirect(signedUrl, 302);
  } catch (err) {
    logApiError("CV download: signed URL failed", err, {
      path: "/api/admin/candidates-2/[id]/cv-download",
      candidateId: id,
      storagePath: cv.cv_storage_path,
    });
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not create download link." },
      { status: 500 },
    );
  }
}
