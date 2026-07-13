import { describe, expect, it, vi } from "vitest";

import {
  createJobStageMapping,
  createPipelineStage,
  createPipelineSubStage,
  getJobStageMappingById,
  getPipelineStageById,
  getPipelineSubStageById,
  listJobStageMappings,
  listPipelineStages,
  listPipelineSubStages,
  reconcileJobStageMappings,
  softDeleteJobStageMapping,
  softDeletePipelineStage,
  softDeletePipelineSubStage,
  updateJobStageMappingSequence,
  updatePipelineStage,
  updatePipelineSubStage,
} from "@/lib/db/pipeline-stages";

function fakeDb(rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query };
}

/** Routes each call based on the SQL text, since reconcile issues a mixed sequence of statements. */
function fakeReconcileDb(existingRows: unknown[]) {
  const query = vi.fn();
  query.mockImplementation((sql: string, values?: unknown[]) => {
    if (sql.includes("SELECT * FROM job_stage_mappings")) {
      return Promise.resolve({ rows: existingRows });
    }
    if (sql.includes("UPDATE job_stage_mappings") && sql.includes("sequence_number = $2")) {
      const [id, sequenceNumber] = values as [string, number];
      return Promise.resolve({
        rows: [{ id, sequence_number: sequenceNumber, pipeline_stage_id: "updated" }],
      });
    }
    if (sql.includes("INSERT INTO job_stage_mappings")) {
      const [jobId, pipelineStageId, sequenceNumber] = values as [string, string, number];
      return Promise.resolve({
        rows: [
          {
            id: `new-${pipelineStageId}`,
            job_id: jobId,
            pipeline_stage_id: pipelineStageId,
            sequence_number: sequenceNumber,
          },
        ],
      });
    }
    if (sql.includes("SET deleted_at = now()")) {
      return Promise.resolve({ rows: [{ id: (values as [string])[0] }] });
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  return { query };
}

describe("pipeline_stages", () => {
  it("getPipelineStageById selects the quoted desc column", async () => {
    const row = { id: "s1", code: "screening", label: "Screening" };
    const db = fakeDb([row]);

    const result = await getPipelineStageById(db, "s1");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining(`"desc"`),
      ["s1"],
    );
  });

  it("listPipelineStages orders by label and filters deleted", async () => {
    const db = fakeDb([]);
    await listPipelineStages(db);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE deleted_at IS NULL ORDER BY label"),
    );
  });

  it("createPipelineStage defaults color to zinc", async () => {
    const row = { id: "s1" };
    const db = fakeDb([row]);

    await createPipelineStage(db, { code: "screening", label: "Screening" });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("COALESCE($4, 'zinc')");
    expect(values).toEqual(["screening", "Screening", null, null]);
  });

  it("updatePipelineStage quotes the desc column in the SET clause", async () => {
    const row = { id: "s1", desc: "New description" };
    const db = fakeDb([row]);

    await updatePipelineStage(db, "s1", { desc: "New description" });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain(`"desc" = $2`);
    expect(values).toEqual(["s1", "New description"]);
  });

  it("softDeletePipelineStage sets deleted_at and updated_at", async () => {
    const db = fakeDb([{ id: "s1" }]);
    await softDeletePipelineStage(db, "s1");
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("SET deleted_at = now(), updated_at = now()"),
      ["s1"],
    );
  });
});

describe("pipeline_sub_stages", () => {
  it("getPipelineSubStageById selects by id", async () => {
    const row = { id: "sub1" };
    const db = fakeDb([row]);
    const result = await getPipelineSubStageById(db, "sub1");
    expect(result).toEqual(row);
  });

  it("listPipelineSubStages orders by sequence_number", async () => {
    const db = fakeDb([]);
    await listPipelineSubStages(db, "s1");
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY sequence_number"),
      ["s1"],
    );
  });

  it("createPipelineSubStage defaults is_default/is_passed to false", async () => {
    const row = { id: "sub1" };
    const db = fakeDb([row]);

    await createPipelineSubStage(db, {
      pipelineStageId: "s1",
      code: "cv_review",
      label: "CV Review",
      sequenceNumber: 1,
    });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("COALESCE($5, false), COALESCE($6, false)");
    expect(values).toEqual(["s1", "cv_review", "CV Review", 1, null, null]);
  });

  it("updatePipelineSubStage never sets updated_at (table has no such column)", async () => {
    const row = { id: "sub1" };
    const db = fakeDb([row]);

    await updatePipelineSubStage(db, "sub1", { sequenceNumber: 2 });

    const [sql] = db.query.mock.calls[0];
    expect(sql).not.toContain("updated_at");
    expect(sql).toContain("sequence_number = $2");
  });

  it("softDeletePipelineSubStage never sets updated_at", async () => {
    const db = fakeDb([{ id: "sub1" }]);
    await softDeletePipelineSubStage(db, "sub1");
    const [sql] = db.query.mock.calls[0];
    expect(sql).not.toContain("updated_at");
    expect(sql).toContain("SET deleted_at = now()");
  });
});

describe("job_stage_mappings", () => {
  it("getJobStageMappingById selects by id", async () => {
    const row = { id: "m1" };
    const db = fakeDb([row]);
    const result = await getJobStageMappingById(db, "m1");
    expect(result).toEqual(row);
  });

  it("listJobStageMappings orders by sequence_number for a job", async () => {
    const db = fakeDb([]);
    await listJobStageMappings(db, "job-1");
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE job_id = $1 AND deleted_at IS NULL"),
      ["job-1"],
    );
  });

  it("createJobStageMapping inserts job/stage/sequence", async () => {
    const row = { id: "m1" };
    const db = fakeDb([row]);

    await createJobStageMapping(db, {
      jobId: "job-1",
      pipelineStageId: "s1",
      sequenceNumber: 1,
    });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO job_stage_mappings"),
      ["job-1", "s1", 1],
    );
  });

  it("updateJobStageMappingSequence updates sequence_number and updated_at", async () => {
    const row = { id: "m1", sequence_number: 2 };
    const db = fakeDb([row]);

    const result = await updateJobStageMappingSequence(db, "m1", 2);

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("SET sequence_number = $2, updated_at = now()"),
      ["m1", 2],
    );
  });

  it("softDeleteJobStageMapping sets deleted_at and updated_at", async () => {
    const db = fakeDb([{ id: "m1" }]);
    await softDeleteJobStageMapping(db, "m1");
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("SET deleted_at = now(), updated_at = now()"),
      ["m1"],
    );
  });
});

describe("reconcileJobStageMappings", () => {
  it("soft-deletes every active mapping when stageIds is null/empty", async () => {
    const existing = [
      { id: "m1", pipeline_stage_id: "s1" },
      { id: "m2", pipeline_stage_id: "s2" },
    ];
    const db = fakeReconcileDb(existing);

    const result = await reconcileJobStageMappings(db, "job-1", null);

    expect(result).toEqual([]);
    const deleteCalls = db.query.mock.calls.filter(([sql]) =>
      sql.includes("SET deleted_at = now()"),
    );
    expect(deleteCalls.map(([, values]) => values)).toEqual([["m1"], ["m2"]]);
  });

  it("updates sequence for stages that remain, without touching their id", async () => {
    const existing = [{ id: "m1", pipeline_stage_id: "s1" }];
    const db = fakeReconcileDb(existing);

    const result = await reconcileJobStageMappings(db, "job-1", ["s1"]);

    expect(result).toEqual([
      { id: "m1", sequence_number: 1, pipeline_stage_id: "updated" },
    ]);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("sequence_number = $2"),
      ["m1", 1],
    );
  });

  it("inserts new mappings for stages not already active", async () => {
    const db = fakeReconcileDb([]);

    const result = await reconcileJobStageMappings(db, "job-1", ["s1"]);

    expect(result).toEqual([
      { id: "new-s1", job_id: "job-1", pipeline_stage_id: "s1", sequence_number: 1 },
    ]);
  });

  it("soft-deletes stages no longer present and dedupes input (first occurrence wins)", async () => {
    const existing = [
      { id: "m1", pipeline_stage_id: "s1" },
      { id: "m2", pipeline_stage_id: "stale" },
    ];
    const db = fakeReconcileDb(existing);

    await reconcileJobStageMappings(db, "job-1", ["s1", "s1"]);

    const deleteCalls = db.query.mock.calls.filter(([sql]) =>
      sql.includes("SET deleted_at = now()"),
    );
    expect(deleteCalls.map(([, values]) => values)).toEqual([["m2"]]);
  });
});
