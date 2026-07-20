import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { CV_TEMP_KEY_PREFIX } from "@/lib/candidates/upload-constants";
import { createSignedDownloadUrl } from "@/lib/storage/s3";

/**
 * Signed-redirect PDF preview for a file still sitting in the S3 temp
 * folder, before any `campaign_applied` row exists -- mirrors
 * `app/api/admin/candidates/[id]/cv-download/route.ts`'s pattern (plain
 * `<iframe>` against a route that 302s to a short-lived signed URL), keyed
 * by the temp key itself instead of a campaign_applied id since no row
 * exists yet to look one up from.
 */
export async function GET(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const key = new URL(request.url).searchParams.get("key");
  if (!key || !key.startsWith(CV_TEMP_KEY_PREFIX)) {
    return Response.json({ error: "Invalid or missing temp upload key." }, { status: 400 });
  }

  try {
    const signedUrl = await createSignedDownloadUrl(key, 120);
    return Response.redirect(signedUrl, 302);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not create download link.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
