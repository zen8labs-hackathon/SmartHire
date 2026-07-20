import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { getCampaignAppliedById } from "@/lib/db/campaign-applied";
import { getCandidateById } from "@/lib/db/candidates";
import { listCvDetailVersionsByCampaignApplied } from "@/lib/db/cv-detail-versions";
import { getPool } from "@/lib/db/config/client";
import type { CvManagementVersionListItem, CvManagementVersionKind } from "@/lib/candidates/cv-management-version-list";
import type { CvDetailRollbackSnapshot } from "@/lib/candidates/cv-detail-version-snapshot";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId || !UUID_RE.test(campaignAppliedId)) {
    return Response.json({ error: "Invalid candidate id." }, { status: 400 });
  }

  const db = getPool();

  const campaignApplied = await getCampaignAppliedById(db, campaignAppliedId);
  if (!campaignApplied) {
    return Response.json({ error: "Application not found." }, { status: 404 });
  }

  const candidate = await getCandidateById(db, campaignApplied.candidate_id);
  if (!candidate) {
    return Response.json({ error: "Candidate not found." }, { status: 404 });
  }

  const cvVersions = await listCvDetailVersionsByCampaignApplied(db, campaignAppliedId);

  const versions: CvManagementVersionListItem[] = cvVersions.map((v, idx) => {
    const isLatest = idx === 0;
    const isCurrentlyActive = v.id === campaignApplied.active_cv_version_id;

    let kind: CvManagementVersionKind = "archived_cv";
    if (isCurrentlyActive) {
      kind = "active";
    } else if (v.source_event === "manual_edit" || v.source_event === "restore") {
      kind = "snapshot_event";
    }

    const snapshot: CvDetailRollbackSnapshot = {
      cv_storage_path: v.cv_storage_path,
      original_filename: v.original_filename,
      mime_type: v.mime_type,
      parsing_status: v.parsing_status,
      parsing_error: v.parsing_error,
      parsed_payload: v.parsed_payload,
      name: candidate.name,
      role: v.role,
      experience_years: v.experience_years,
      skills: v.skills,
      degree: v.degree,
      school: v.education, // map education to school
      source: campaignApplied.source,
      source_other: campaignApplied.source_other,
      cv_uploaded_at: v.created_at.toISOString(),
      cv_file_sha256: v.cv_file_sha256,
      cv_content_sha256: v.cv_content_sha256,
      jd_match_score: v.jd_match_score,
      jd_match_status: v.jd_match_status,
      jd_match_error: v.jd_match_error,
      jd_match_rationale: v.jd_match_rationale,
      avatar_url: null,
    };

    return {
      kind,
      sortAt: v.created_at.toISOString(),
      isLatest,
      displayVersion: v.version_number,
      versionEventId: String(v.id),
      eventType:
        v.source_event === "manual_edit"
          ? "profile_edit"
          : v.source_event === "restore"
            ? "full_restore"
            : undefined,
      changeSummary: v.change_summary,
      snapshot,
      candidateId: campaignAppliedId,
    };
  });

  return Response.json({ history: [], versions });
}
