import type { QueryExecutor } from "@/lib/db/config/client";

export type StageHistoryRow = {
  id: string;
  campaign_applied_id: string;
  from_stage_mapping_id: string | null;
  to_stage_mapping_id: string | null;
  from_sub_state_id: string | null;
  to_sub_state_id: string | null;
  from_stage_name: string | null;
  to_stage_name: string | null;
  reason: string | null;
  by_user_id: string | null;
  at: Date;
};

export type InsertStageHistoryInput = {
  campaignAppliedId: string;
  fromStageMappingId: string | null;
  toStageMappingId: string | null;
  fromSubStateId: string | null;
  toSubStateId: string | null;
  reason?: string | null;
  byUserId: string | null;
};

export async function insertStageHistory(
  db: QueryExecutor,
  i: InsertStageHistoryInput,
): Promise<void> {
  await db.query(
    `INSERT INTO candidate_stage_history
       (campaign_applied_id, from_stage_mapping_id, to_stage_mapping_id,
        from_sub_state_id, to_sub_state_id, reason, by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      i.campaignAppliedId,
      i.fromStageMappingId,
      i.toStageMappingId,
      i.fromSubStateId,
      i.toSubStateId,
      i.reason ?? null,
      i.byUserId,
    ],
  );
}

export async function listStageHistory(
  db: QueryExecutor,
  campaignAppliedId: string,
): Promise<StageHistoryRow[]> {
  const { rows } = await db.query<StageHistoryRow>(
    `SELECT h.*, fs.label AS from_stage_name, ts.label AS to_stage_name
     FROM candidate_stage_history h
     LEFT JOIN job_stage_mappings fm ON fm.id = h.from_stage_mapping_id
     LEFT JOIN pipeline_stages fs ON fs.id = fm.pipeline_stage_id
     LEFT JOIN job_stage_mappings tm ON tm.id = h.to_stage_mapping_id
     LEFT JOIN pipeline_stages ts ON ts.id = tm.pipeline_stage_id
     WHERE h.campaign_applied_id = $1
     ORDER BY h.at DESC`,
    [campaignAppliedId],
  );
  return rows;
}
