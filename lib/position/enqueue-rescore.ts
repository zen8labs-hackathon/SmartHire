import { fileUploadQueue } from "@/lib/queue/file-upload.queue";

export type RescoreTarget = {
  /** campaign_applied.id -- also the dedup key. */
  applicationId: string;
  candidateId: string;
  activeCvVersionId: string;
};

/** Enqueue `rerun-ai-matching` jobs; deduplicated per application. */
export async function enqueueRescore(
  jobId: string,
  userId: string,
  targets: RescoreTarget[],
): Promise<number> {
  if (targets.length === 0) return 0;
  await fileUploadQueue.addBulk(
    targets.map((t) => ({
      name: "rerun-ai-matching",
      data: {
        cvDetailVersionId: t.activeCvVersionId,
        userId,
        jobId,
        candidateId: t.candidateId,
      },
      opts: {
        deduplication: { id: `rerun-ai-matching-${t.applicationId}` },
        priority: 2,
      },
    })),
  );
  return targets.length;
}
