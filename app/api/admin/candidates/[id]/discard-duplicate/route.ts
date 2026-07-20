import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { discardDuplicateApplication } from "@/lib/candidates/merge-duplicate-application";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Hard-deletes a throwaway duplicate-upload application together with its
 * blank `candidates` row. Only used by the "Discard" action in the
 * duplicate-candidate modal, where the id always refers to a fresh,
 * single-application candidate created moments earlier by `sign-upload` --
 * unlike `DELETE /api/admin/candidates/[id]`, which soft-deletes the
 * application only and must be used everywhere else (a real candidate may
 * have other live applications).
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId || !UUID_RE.test(campaignAppliedId)) {
    return Response.json({ error: "Invalid candidate id." }, { status: 400 });
  }

  try {
    const result = await discardDuplicateApplication(campaignAppliedId);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status });
    }
    return new Response(null, { status: 204 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to discard candidate.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
