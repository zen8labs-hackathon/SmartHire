import { notFound } from "next/navigation";

import { AiScannedCvDetailReview } from "@/components/admin/candidates/ai-scanned-cv-detail-review";
import { getCvReview } from "@/lib/candidates/cv-review-data";

type PageProps = {
  params: Promise<{ candidateId: string }>;
};

export default async function CandidateCvReviewPage({ params }: PageProps) {
  const { candidateId } = await params;
  if (!candidateId) {
    notFound();
  }

  const initial = getCvReview(candidateId);

  return <AiScannedCvDetailReview initial={initial} />;
}
