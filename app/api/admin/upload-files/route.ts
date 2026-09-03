import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { NextRequest } from "next/server";

type Body = {
  latestId?: string;
};

type RouteContext = { params: Promise<{ jobId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  // Check if the user is authenticated and has staff privileges
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { jobId } = await params;
  if (!jobId) {
    return Response.json({ error: "Missing job id." }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
