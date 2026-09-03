import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Candidate Detail | Smart Hire Admin",
  description: "Candidate profile and CV version history.",
};

import { CandidateDetailClient } from "@/components/admin/candidates/candidate-detail-client";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { getCandidateById } from "@/lib/db/candidates";
import { getPool } from "@/lib/db/config/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CandidateDetailPage({ params }: PageProps) {
  const { id: candidateId } = await params;
  if (!UUID_RE.test(candidateId)) notFound();

  const { user, access } = await getRequestAuth();
  if (!user) redirect("/login?next=/admin/candidates");
  // Reachable only from the /admin/candidates dashboard, which is itself
  // HR-only -- gate the same way rather than layering job-scoped ACL checks
  // that dashboard never applies in the first place.
  if (!access?.isHr) redirect("/admin/jd");

  const db = getPool();
  const row = await getCandidateById(db, candidateId);
  if (!row) notFound();

  return <CandidateDetailClient key={row.id} candidate={row} />;
}
