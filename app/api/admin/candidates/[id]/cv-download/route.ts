import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { getCampaignAppliedById } from "@/lib/db/campaign-applied";
import { getCvDetailVersionById } from "@/lib/db/cv-detail-versions";
import { getPool } from "@/lib/db/config/client";
import { createSignedDownloadUrl } from "@/lib/storage/s3";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId || !UUID_RE.test(campaignAppliedId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const db = getPool();

  const campaign = await getCampaignAppliedById(db, campaignAppliedId);
  if (!campaign) {
    return Response.json({ error: "Application not found." }, { status: 404 });
  }

  if (!campaign.active_cv_version_id) {
    return Response.json({ error: "No CV file on record." }, { status: 404 });
  }

  const cvVersion = await getCvDetailVersionById(db, campaign.active_cv_version_id);
  if (!cvVersion || !cvVersion.cv_storage_path) {
    return Response.json({ error: "CV version file not found." }, { status: 404 });
  }

  try {
    const signedUrl = await createSignedDownloadUrl(cvVersion.cv_storage_path, 120);
    return Response.redirect(signedUrl, 302);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not create download link.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
