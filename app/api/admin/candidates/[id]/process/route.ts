import { cookies } from "next/headers";
import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import {
  duplicateNewUploadPreviewFromRow,
  findDuplicateCandidateHits,
  shouldFetchCandidatesForDedupe,
  parsedContactFromPayload,
  type CandidateDedupeRow,
  type DuplicateCandidateHit,
  type DuplicateNewUploadPreview,
} from "@/lib/candidates/duplicate-detection";
import { getSupabasePublishableKey } from "@/lib/supabase/env";
import { runJdMatchForCandidate } from "@/lib/candidates/jd-match";
import { getCampaignAppliedAdminRowById } from "@/lib/db/campaign-applied-list";
import { getCvDetailVersionById } from "@/lib/db/cv-detail-versions";
import {
  dedupeMatchStatusLabel,
  findCandidatesByDedupeSignals,
} from "@/lib/db/candidates-dedupe";
import { getPool } from "@/lib/db/config/client";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/session";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId) {
    return Response.json({ error: "Missing candidate id" }, { status: 400 });
  }

  const auth = await requireAdminForRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const bearerHeader = request.headers.get("Authorization");
  const bearer =
    bearerHeader?.startsWith("Bearer ") ? bearerHeader.slice(7).trim() : "";

  let accessToken: string = bearer;
  if (!accessToken) {
    const cookieStore = await cookies();
    accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value ?? "";
  }

  if (!accessToken) {
    return Response.json(
      {
        error:
          "Missing access token for Edge Function. Send Authorization: Bearer from the client (getSession().access_token) or authenticate via cookie.",
      },
      { status: 401 },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabasePublishableKey();
  if (!url || !key) {
    return Response.json(
      { error: "Missing Supabase configuration." },
      { status: 500 },
    );
  }

  let data: any = null;
  let invokeErrorMsg: string | null = null;
  let upstreamStatus = 502;

  try {
    const res = await fetch(`${url}/functions/v1/process-cv`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: key as string,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ candidateId: campaignAppliedId }),
    });

    upstreamStatus = res.status;

    if (!res.ok) {
      const text = await res.text();
      try {
        const parsed = JSON.parse(text);
        invokeErrorMsg = parsed.error ?? parsed.message ?? `${res.status} error`;
      } catch {
        invokeErrorMsg = text || `${res.status} error`;
      }
    } else {
      data = await res.json();
    }
  } catch (err) {
    invokeErrorMsg = err instanceof Error ? err.message : String(err);
  }

  if (invokeErrorMsg) {
    if (process.env.NODE_ENV === "development") {
      console.error("[process-cv invoke]", invokeErrorMsg, { upstreamStatus });
    }
    const status =
      upstreamStatus === 401 || upstreamStatus === 403 ? upstreamStatus : 502;
    return Response.json({ error: invokeErrorMsg }, { status });
  }

  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    !("ok" in data)
  ) {
    const msg = String((data as { error: unknown }).error);
    return Response.json({ error: msg }, { status: 500 });
  }

  const jdMatch = await runJdMatchForCandidate(campaignAppliedId);
  if (process.env.NODE_ENV === "development" && !jdMatch.ok) {
    console.warn("[jd-match]", campaignAppliedId, jdMatch);
  }

  let duplicateCandidates: DuplicateCandidateHit[] = [];
  let duplicateNewUpload: DuplicateNewUploadPreview | null = null;

  const db = getPool();
  const currentRow = await getCampaignAppliedAdminRowById(db, campaignAppliedId);

  if (currentRow) {
    const activeVersion = currentRow.active_cv_version_id
      ? await getCvDetailVersionById(db, currentRow.active_cv_version_id)
      : null;
    const currentDedupe: CandidateDedupeRow = {
      id: campaignAppliedId,
      name: currentRow.candidate_name,
      status: dedupeMatchStatusLabel(currentRow),
      job_opening_id: currentRow.job_id,
      job_opening_title: currentRow.job_position,
      cv_uploaded_at: activeVersion?.created_at.toISOString() ?? currentRow.created_at.toISOString(),
      created_at: currentRow.created_at.toISOString(),
      parsed_payload: activeVersion?.parsed_payload ?? {},
      cv_file_sha256: activeVersion?.cv_file_sha256 ?? null,
      cv_content_sha256: activeVersion?.cv_content_sha256 ?? null,
    };

    if (shouldFetchCandidatesForDedupe(currentDedupe)) {
      const contact = parsedContactFromPayload(currentDedupe.parsed_payload);
      const matches = await findCandidatesByDedupeSignals(db, {
        email: contact.email,
        phoneVariants: contact.phoneVariants,
        cvFileSha256: currentDedupe.cv_file_sha256,
        cvContentSha256: currentDedupe.cv_content_sha256,
      }, campaignAppliedId);

      const others: CandidateDedupeRow[] = matches.map((m) => ({
        id: m.campaign_applied_id,
        name: m.candidate_name,
        status: dedupeMatchStatusLabel(m),
        job_opening_id: m.job_id,
        job_opening_title: m.job_position,
        cv_uploaded_at: m.cv_created_at ? m.cv_created_at.toISOString() : m.created_at.toISOString(),
        created_at: m.created_at.toISOString(),
        parsed_payload: { email: m.candidate_email, phone: m.candidate_phone, role: m.cv_role },
        cv_file_sha256: m.cv_file_sha256,
        cv_content_sha256: m.cv_content_sha256,
      }));

      duplicateCandidates = findDuplicateCandidateHits(currentDedupe, others);
    }

    if (duplicateCandidates.length > 0) {
      duplicateNewUpload = duplicateNewUploadPreviewFromRow(currentDedupe);
    }
  }

  const base =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : { ok: true };

  return Response.json({
    ...base,
    duplicateCandidates,
    duplicateNewUpload,
    jdMatch: jdMatch.ok
      ? jdMatch.skipped
        ? { skipped: true, reason: jdMatch.reason }
        : { skipped: false, score: jdMatch.score }
      : { error: jdMatch.error },
  });
}
