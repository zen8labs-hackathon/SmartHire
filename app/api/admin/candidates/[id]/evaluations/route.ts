import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { listCandidateEvaluationReviewsByCampaignApplied } from "@/lib/db/candidate-evaluation-reviews";
import { getPool } from "@/lib/db/config/client";
import { createSignedDownloadUrl } from "@/lib/storage/s3";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Latest generated evaluation PDF for this application, if any. Generation
 * itself (POST, PDF fill/render, template upload) is a separate, deferred
 * slice — still on the old `/api/admin/job-descriptions/[id]/evaluations`
 * route, which is broken today (calls `.supabase` on an auth result that no
 * longer has one) and untouched by this change.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId || !UUID_RE.test(campaignAppliedId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const [latest] = await listCandidateEvaluationReviewsByCampaignApplied(
    getPool(),
    campaignAppliedId,
  );

  if (!latest || latest.revoked_at) {
    return Response.json({ latest: null });
  }

  try {
    const downloadUrl = await createSignedDownloadUrl(
      latest.filled_pdf_storage_path,
      3600,
    );
    return Response.json({
      latest: {
        id: latest.id,
        createdAt: latest.created_at,
        previewPath: `/evaluation-preview/${latest.preview_token}`,
        downloadUrl,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not create download link.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
