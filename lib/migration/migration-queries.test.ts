import { describe, expect, it, vi } from "vitest";

import type { QueryExecutor } from "@/lib/db/config/client";
import { getMigrationOptions, listMigrationProgress, listUsablePipelines } from "@/lib/migration/migration-queries";

const db = (responses: Record<string, unknown[]>) =>
  ({
    query: vi.fn(async (sql: string) => {
      for (const [k, rows] of Object.entries(responses)) if (sql.includes(k)) return { rows };
      return { rows: [] };
    }),
  }) as unknown as QueryExecutor;

const prow = (pipeline_id: string, row_id: string, deleted: Date | null) => ({
  pipeline_id, name: pipeline_id, row_id, pipeline_stage_id: `s-${row_id}`, sequence_number: 1,
  code: "A", label: "A", stage_type: null, stage_deleted_at: deleted,
});

describe("listUsablePipelines", () => {
  it("drops pipelines whose rows are all on deleted stages and flags deleted rows", async () => {
    const res = await listUsablePipelines(
      db({ "FROM pipelines p": [prow("p1", "r1", null), prow("p1", "r2", new Date()), prow("p2", "r3", new Date())] }),
    );
    expect(res.map((p) => p.id)).toEqual(["p1"]);
    expect(res[0].rows.map((r) => r.stageDeleted)).toEqual([false, true]);
  });
});

describe("getMigrationOptions", () => {
  it("returns null for an unknown job", async () => {
    expect(await getMigrationOptions(db({}), "j")).toBeNull();
  });

  it("maps mappings, scheduled interviews and pipelines", async () => {
    const res = await getMigrationOptions(
      db({
        "FROM jobs WHERE": [{ id: "j", position: "Dev", flow_version: 1 }],
        "FROM job_stage_mappings m": [
          { id: "m1", pipeline_stage_id: "s1", sequence_number: 1, label: "CV", stage_deleted_at: null, candidates: 3, pipeline_row_id: null },
        ],
        "FROM candidate_schedules": [{ n: 2 }],
        "FROM pipelines p": [prow("p1", "r1", null)],
      }),
      "j",
    );
    expect(res?.job).toEqual({ id: "j", title: "Dev", flowVersion: 1 });
    expect(res?.mappings[0]).toMatchObject({ id: "m1", candidates: 3, stageDeleted: false });
    expect(res?.scheduledInterviews).toBe(2);
    expect(res?.pipelines).toHaveLength(1);
  });
});

describe("listMigrationProgress", () => {
  it("maps rows and ISO-formats conversion time", async () => {
    const at = new Date("2026-01-02T03:04:05Z");
    const res = await listMigrationProgress(
      db({
        "FROM jobs j": [
          { id: "a", position: "A", status: "open", flow_version: 2, candidates: 4, confirmed_at: at, by: "hr" },
          { id: "b", position: "B", status: "open", flow_version: 1, candidates: 0, confirmed_at: null, by: null },
        ],
      }),
    );
    expect(res[0].convertedAt).toBe(at.toISOString());
    expect(res[1]).toMatchObject({ convertedAt: null, convertedBy: null, flowVersion: 1 });
  });
});
