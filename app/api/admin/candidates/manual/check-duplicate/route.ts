import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { findDuplicateCandidatesByContact } from "@/lib/candidates/find-duplicate-candidates";
import { getPool } from "@/lib/db/config/client";

type Body = { email?: string | null; phone?: string | null };

/**
 * Pre-create dedupe check for the manual-entry form: no candidate exists yet
 * (unlike the `/candidate-detail` profile-edit check, which excludes the
 * candidate being edited), so this just looks up existing `candidates` rows
 * matching the typed email/phone. The manual-entry form uses the result to
 * show the same merge-or-save-anyway modal as the profile edit, before ever
 * creating a row.
 */
export async function POST(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  let body: Body = {};
  try {
    const raw = await request.text();
    if (raw.trim()) body = JSON.parse(raw) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const duplicates = await findDuplicateCandidatesByContact(getPool(), {
      email: body.email ?? null,
      phone: body.phone ?? null,
    });
    return Response.json({ duplicates });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to check for duplicates.";
    return Response.json({ error: message }, { status: 500 });
  }
}
