import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Candidate Detail | Smart Hire Admin",
  description: "Candidate profile and CV version history.",
};

import { CandidateDetailClient } from "@/components/admin/candidates/candidate-detail-client";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { getCampaignAppliedAdminRowById } from "@/lib/db/campaign-applied-list";
import { getPool } from "@/lib/db/config/client";
import { campaignAppliedAdminRowToCandidateDetailRow } from "@/lib/candidates/campaign-applied-to-candidate-detail-row";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CandidateDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const { user, access } = await getRequestAuth();
  if (!user) redirect("/login?next=/admin/candidates");
  // Reachable only from the /admin/candidates dashboard, which is itself
  // HR-only -- gate the same way rather than layering job-scoped ACL checks
  // that dashboard never applies in the first place.
  if (!access?.isHr) redirect("/admin/jd");

  const db = getPool();
  const row = await getCampaignAppliedAdminRowById(db, id);
  if (!row) notFound();

  const candidate = campaignAppliedAdminRowToCandidateDetailRow(row);

  // `key` forces a full remount whenever the candidate changes, so every
  // piece of local state (fetched-application refs, expanded rows, selected
  // version) starts fresh instead of a stale fetch-guard silently keeping
  // the previous candidate's data on screen if this component instance is
  // ever reused across navigations.
  return <CandidateDetailClient key={candidate.id} candidate={candidate} />;
}
