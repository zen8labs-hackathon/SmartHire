import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { listChapterMembers } from "@/lib/admin/list-org-users";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return Response.json({ error: "Invalid chapter id." }, { status: 400 });
  }

  try {
    const members = await listChapterMembers(id);
    return Response.json({ members });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to load members." },
      { status: 500 },
    );
  }
}
