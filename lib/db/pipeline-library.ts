import { withTransaction, type QueryExecutor } from "@/lib/db/config/client";
import {
  createPipelineStage,
  createPipelineSubStage,
  listPipelineSubStages,
  softDeletePipelineStage,
  softDeletePipelineSubStage,
  updatePipelineStage,
  updatePipelineSubStage,
} from "@/lib/db/pipeline-stages";

export type LibrarySubInput = {
  code: string;
  label: string;
  isDefault: boolean;
  isPassed: boolean;
  isTerminal: boolean;
  requiresReason: boolean;
  requiresDecision: boolean;
  isWithdraw: boolean;
};

export type LibraryStageInput = {
  code: string;
  label: string;
  desc: string | null;
  color: string | null;
  stageType: string;
  subs: LibrarySubInput[];
};

export class LibraryError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "IN_USE",
    message: string,
  ) {
    super(message);
  }
}

async function stageIdByCode(db: QueryExecutor, code: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM pipeline_stages WHERE code = $1 AND deleted_at IS NULL`,
    [code],
  );
  return rows[0]?.id ?? null;
}

/** Creates or updates a library stage and reconciles its steps by code in one transaction. */
export async function saveLibraryStage(input: LibraryStageInput, isNew: boolean): Promise<void> {
  await withTransaction(async (db) => {
    let stageId: string;
    if (isNew) {
      const stage = await createPipelineStage(db, {
        code: input.code,
        label: input.label,
        desc: input.desc,
        color: input.color,
        stageType: input.stageType,
      });
      stageId = stage.id;
    } else {
      const id = await stageIdByCode(db, input.code);
      if (!id) throw new LibraryError("NOT_FOUND", "Stage not found.");
      await updatePipelineStage(db, id, {
        label: input.label,
        desc: input.desc,
        color: input.color,
        stageType: input.stageType,
      });
      stageId = id;
    }

    const existing = new Map((await listPipelineSubStages(db, stageId)).map((s) => [s.code, s]));
    for (let i = 0; i < input.subs.length; i += 1) {
      const sub = input.subs[i];
      const fields = {
        label: sub.label,
        sequenceNumber: i + 1,
        isDefault: sub.isDefault,
        isPassed: sub.isPassed,
        isTerminal: sub.isTerminal,
        requiresReason: sub.requiresReason,
        requiresDecision: sub.requiresDecision,
        isWithdraw: sub.isWithdraw,
      };
      const current = existing.get(sub.code);
      if (current) {
        existing.delete(sub.code);
        await updatePipelineSubStage(db, current.id, fields);
      } else {
        await createPipelineSubStage(db, { pipelineStageId: stageId, code: sub.code, ...fields });
      }
    }
    for (const stale of existing.values()) await softDeletePipelineSubStage(db, stale.id);
  });
}

/**
 * Soft-deletes a library stage. A stage that is still in use is allowed: pipeline rows and
 * job stage mappings keep pointing at it, so jobs/candidates keep showing it, while it
 * disappears from the library and from pickers for new jobs/pipelines.
 */
export async function deleteLibraryStage(code: string): Promise<void> {
  await withTransaction(async (db) => {
    const id = await stageIdByCode(db, code);
    if (!id) throw new LibraryError("NOT_FOUND", "Stage not found.");
    await softDeletePipelineStage(db, id);
  });
}
