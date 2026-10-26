import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = { query: vi.fn() };
vi.mock("@/lib/db/config/client", () => ({
  withTransaction: (fn: (db: typeof tx) => Promise<unknown>) => fn(tx),
}));

import { deleteLibraryStage } from "@/lib/db/pipeline-library";
import { applyPipelineToJob, isPipelineUsable } from "@/lib/db/pipelines";
import { listDeletedStagesInUse } from "@/lib/db/pipeline-stages";
import { countCampaignAppliedByStageForJob } from "@/lib/db/campaign-applied-list";
import { getPipelineLibrary } from "@/lib/pipelines/get-pipelines";

function fakeDb(rows: unknown[] = []) {
  return { query: vi.fn().mockResolvedValue({ rows }) };
}

beforeEach(() => tx.query.mockReset());

describe("deleteLibraryStage (soft delete even when in use)", () => {
  it("soft-deletes without running any in-use check", async () => {
    tx.query.mockImplementation((sql?: string) =>
      Promise.resolve({ rows: String(sql).includes("SELECT id FROM pipeline_stages") ? [{ id: "s1" }] : [] }),
    );
    await expect(deleteLibraryStage("screening")).resolves.toBeUndefined();
    const sqls = tx.query.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes("UPDATE pipeline_stages") && s.includes("deleted_at"))).toBe(true);
    expect(sqls.some((s) => s.includes("pipeline_rows") || s.includes("job_stage_mappings"))).toBe(false);
  });

  it("still throws NOT_FOUND for an unknown stage", async () => {
    tx.query.mockResolvedValue({ rows: [] });
    await expect(deleteLibraryStage("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("pickers exclude soft-deleted stages", () => {
  it("applyPipelineToJob snapshot only joins live stages", async () => {
    const db = { query: vi.fn() };
    db.query
      .mockResolvedValueOnce({ rows: [{}] }) // job lock
      .mockResolvedValueOnce({ rows: [] }) // no existing mappings
      .mockResolvedValueOnce({ rows: [] }); // pipeline rows (all stages deleted)
    await expect(applyPipelineToJob(db, "j1", "p1", null)).rejects.toMatchObject({
      code: "PIPELINE_NOT_FOUND",
    });
    expect(String(db.query.mock.calls[2][0])).toMatch(/pipeline_stages s ON s\.id = r\.pipeline_stage_id AND s\.deleted_at IS NULL/);
  });

  it("isPipelineUsable requires at least one live stage", async () => {
    const db = fakeDb([]);
    expect(await isPipelineUsable(db, "p1")).toBe(false);
    expect(String(db.query.mock.calls[0][0])).toMatch(/s\.deleted_at IS NULL/);
  });
});

describe("display of deleted-in-use stages", () => {
  it("listDeletedStagesInUse selects deleted stages referenced by live pipelines", async () => {
    const db = fakeDb([{ id: "s1" }]);
    expect(await listDeletedStagesInUse(db)).toHaveLength(1);
    const sql = String(db.query.mock.calls[0][0]);
    expect(sql).toMatch(/s\.deleted_at IS NOT NULL/);
    expect(sql).toMatch(/pipeline_rows/);
  });

  it("getPipelineLibrary flags deleted stages", async () => {
    const stage = (id: string, code: string, deleted_at: string | null) => ({
      id, code, label: code, desc: null, color: null, allow_schedule: false, stage_type: "normal", deleted_at,
    });
    const db = { query: vi.fn() };
    db.query.mockImplementation((sql: string) => {
      if (sql.includes("s.deleted_at IS NOT NULL")) return Promise.resolve({ rows: [stage("s2", "old", "2026-01-01")] });
      if (sql.includes("FROM pipeline_stages")) return Promise.resolve({ rows: [stage("s1", "live", null)] });
      return Promise.resolve({ rows: [] });
    });
    const lib = await getPipelineLibrary(db);
    expect(lib.find((s) => s.id === "old")?.deleted).toBe(true);
    expect(lib.find((s) => s.id === "live")?.deleted).toBeUndefined();
  });

  it("countCampaignAppliedByStageForJob does not hide deleted stages", async () => {
    const db = fakeDb([]);
    await countCampaignAppliedByStageForJob(db, "j1");
    const sql = String(db.query.mock.calls[0][0]);
    expect(sql).not.toMatch(/ps\.deleted_at IS NULL/);
    expect(sql).toMatch(/stage_deleted/);
  });
});
