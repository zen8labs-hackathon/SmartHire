import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { isValidEmail, normalizeEmail } from "@/lib/auth/email";

type Body = {
  previousCandidateId?: string;
  matchedOn?: "email" | "phone" | "email_or_phone" | "cv_content" | "cv_file";
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: replacementCandidateId } = await params;
  if (!replacementCandidateId || !UUID_RE.test(replacementCandidateId)) {
    return Response.json({ error: "Invalid candidate id." }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const previousCandidateId =
    typeof body.previousCandidateId === "string" ? body.previousCandidateId.trim() : "";
  if (!previousCandidateId || !UUID_RE.test(previousCandidateId)) {
    return Response.json({ error: "Invalid previous candidate id." }, { status: 400 });
  }
  if (previousCandidateId === replacementCandidateId) {
    return Response.json({ error: "Cannot replace with the same candidate." }, { status: 400 });
  }

  const matchedOn =
    body.matchedOn === "email" ||
    body.matchedOn === "phone" ||
    body.matchedOn === "email_or_phone" ||
    body.matchedOn === "cv_content" ||
    body.matchedOn === "cv_file"
      ? body.matchedOn
      : "email_or_phone";

  const { data: previous, error: prevErr } = await auth.supabase
    .from("candidates")
    .select(
      "id, is_active, status, cv_storage_path, original_filename, mime_type, cv_uploaded_at, created_at",
    )
    .eq("id", previousCandidateId)
    .maybeSingle();
  if (prevErr || !previous) {
    return Response.json({ error: "Previous candidate not found." }, { status: 404 });
  }
  if (!previous.is_active) {
    return Response.json({ error: "Previous candidate is already archived." }, { status: 409 });
  }

  const { data: replacement, error: repErr } = await auth.supabase
    .from("candidates")
    .select("id, is_active")
    .eq("id", replacementCandidateId)
    .maybeSingle();
  if (repErr || !replacement) {
    return Response.json({ error: "Replacement candidate not found." }, { status: 404 });
  }
  if (!replacement.is_active) {
    return Response.json({ error: "Replacement candidate is not active." }, { status: 409 });
  }

  const replacedAt = new Date().toISOString();
  const actorRaw = auth.userEmail?.trim() ?? "";
  const replacedByEmail =
    actorRaw && isValidEmail(normalizeEmail(actorRaw)) ? normalizeEmail(actorRaw) : null;

  const { error: archiveErr } = await auth.supabase
    .from("candidates")
    .update({
      is_active: false,
      replaced_by_candidate_id: replacementCandidateId,
      replaced_at: replacedAt,
      replaced_reason: "replaced_by_new_upload",
    })
    .eq("id", previousCandidateId)
    .eq("is_active", true);
  if (archiveErr) {
    return Response.json({ error: archiveErr.message }, { status: 500 });
  }

  const { error: resetErr } = await auth.supabase
    .from("candidates")
    .update({
      status: "New",
      interview_at: null,
      onboarding_at: null,
    })
    .eq("id", replacementCandidateId);
  if (resetErr) {
    return Response.json({ error: resetErr.message }, { status: 500 });
  }

  const { error: historyErr } = await auth.supabase
    .from("candidate_cv_replacements")
    .insert({
      previous_candidate_id: previousCandidateId,
      replacement_candidate_id: replacementCandidateId,
      previous_status: String(previous.status ?? "New"),
      new_status: "New",
      matched_on: matchedOn,
      previous_cv_storage_path: previous.cv_storage_path as string | null,
      previous_filename: previous.original_filename as string | null,
      previous_mime_type: previous.mime_type as string | null,
      previous_cv_uploaded_at:
        (previous.cv_uploaded_at as string | null) ??
        (previous.created_at as string | null) ??
        null,
      replaced_by_email: replacedByEmail,
      replaced_at: replacedAt,
    });
  if (historyErr) {
    return Response.json({ error: historyErr.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
