import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { findDuplicateCandidatesByContact } from "@/lib/candidates/find-duplicate-candidates";
import { getCandidateById } from "@/lib/db/candidates";
import { getPool } from "@/lib/db/config/client";
import { getLatestCvDetailVersionForCandidate } from "@/lib/db/cv-detail-versions";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ candidateId: string }> };

type Body = { email?: string | null; phone?: string | null };

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { candidateId } = await params;
  if (!candidateId || !UUID_RE.test(candidateId)) {
    return Response.json({ error: "Invalid candidate ID" }, { status: 400 });
  }

  let body: Body = {};
  try {
    const raw = await request.text();
    if (raw.trim()) body = JSON.parse(raw) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = getPool();

  const candidate = await getCandidateById(db, candidateId);
  if (!candidate) {
    return Response.json({ error: "Invalid candidate ID" }, { status: 400 });
  }

  const email = body.email !== undefined ? body.email : candidate.email;
  const phone = body.phone !== undefined ? body.phone : candidate.phone;

  try {
    const duplicates = await findDuplicateCandidatesByContact(
      db,
      { email, phone },
      { excludeCandidateId: candidateId },
    );

    // `currentCvVersionId` is *this* candidate's latest CV -- the one that
    // gets folded into the picked match on merge. `null` when it has no CV.
    const currentCv = duplicates.length
      ? await getLatestCvDetailVersionForCandidate(db, candidateId)
      : null;

    return Response.json({
      duplicates,
      currentCvVersionId: currentCv?.id ?? null,
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to check for duplicates.";
    return Response.json({ error: message }, { status: 500 });
  }
}
