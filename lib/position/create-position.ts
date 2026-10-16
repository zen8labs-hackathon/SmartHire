import { replaceJobDescriptionViewerChapters } from "@/lib/admin/jd-viewer-sync";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { createJob, hardDeleteJob, updateJob, type JobRow } from "@/lib/db/jobs";
import { PipelineApplyError, applyPipelineToJob } from "@/lib/db/pipelines";
import { buildFinalJdStoragePath, isJdTempKey } from "@/lib/jd/upload-constants";
import {
  BLANK_POSITION_TITLE,
  positionTitleFromFile,
  type PositionHireType,
} from "@/lib/positions/create-position";
import { draftNote } from "@/lib/position/jd-state";
import { deleteObject, moveObject } from "@/lib/storage/s3";

export type CreatePositionInput = {
  chapterId: string;
  type: PositionHireType;
  headcount: number;
  /** Required: every new position is created with a pipeline from the `pipelines` table. */
  pipelineId: string;
  createdBy: string;
  jd: { storagePath: string; filename: string | null; mimeType: string | null } | null;
};

/** BR-02-02: Chapter Head is locked to their own chapter; HR may pick any. */
export function canCreateInChapter(
  access: { isHr: boolean; headedChapterIds: string[] },
  chapterId: string,
): boolean {
  return access.isHr || access.headedChapterIds.includes(chapterId);
}

/** Temp upload keys only: `jd/…`, no traversal. */
export function isTempJdKey(key: unknown): key is string {
  return typeof key === "string" && isJdTempKey(key);
}

export function draftTitle(filename: string | null): string {
  return filename ? positionTitleFromFile(filename) : BLANK_POSITION_TITLE;
}

export class CreatePositionError extends Error {}

/**
 * Creates a Draft position (owner = creator), grants its chapter, applies the chosen
 * pipeline, and moves the JD to its final key. The caller starts JD processing.
 */
export async function createDraftPosition(
  input: CreatePositionInput,
): Promise<JobRow> {
  const { jd } = input;
  const job = await withTransaction(async (client) => {
    const created = await createJob(client, {
      position: draftTitle(jd?.filename ?? null),
      status: "Pending",
      employmentStatus: input.type,
      hireType: input.type,
      headcount: input.headcount,
      updateNote: draftNote(jd ? undefined : "Blank form"),
      jdStoragePath: jd?.storagePath ?? null,
      jdOriginalFilename: jd?.filename ?? null,
      jdMimeType: jd?.mimeType ?? null,
      createdBy: input.createdBy,
    });
    try {
      await applyPipelineToJob(client, created.id, input.pipelineId, input.createdBy);
    } catch (e) {
      if (e instanceof PipelineApplyError && e.code === "PIPELINE_NOT_FOUND") {
        throw new CreatePositionError("Selected pipeline was not found.");
      }
      throw e;
    }
    await replaceJobDescriptionViewerChapters(client, {
      jobId: created.id,
      chapterIds: [input.chapterId],
      grantedBy: input.createdBy,
    });
    return created;
  });

  if (!jd) return job;

  const finalPath = buildFinalJdStoragePath(job.id, jd.storagePath, jd.filename);
  try {
    await moveObject(jd.storagePath, finalPath);
    const updated = await updateJob(getPool(), job.id, {
      jdStoragePath: finalPath,
    });
    return updated ?? job;
  } catch (e) {
    // Fresh job has no applications yet, so hard delete is safe.
    await hardDeleteJob(getPool(), job.id).catch(() => {});
    await deleteObject(finalPath).catch(() => {});
    console.error("Failed to finalize position JD file:", e);
    throw new CreatePositionError(
      "Position was not created: the JD file failed to finalize. Please retry.",
    );
  }
}
