import { describe, expect, it, vi } from "vitest";

import {
  countActiveApplicationsByJobIds,
  createApplicationWithInitialCv,
  createCampaignApplied,
  getCampaignAppliedById,
  listCampaignAppliedByCandidate,
  listCampaignAppliedByIds,
  listCampaignAppliedByJob,
  lockCampaignAppliedForJdMatch,
  setActiveCvVersion,
  softDeleteCampaignApplied,
  updateCampaignApplied,
} from "@/lib/db/campaign-applied";

function fakeDb(queuedRows: unknown[][]) {
  const query = vi.fn();
  for (const rows of queuedRows) {
    query.mockResolvedValueOnce({ rows });
  }
  return { query };
}

describe("countActiveApplicationsByJobIds", () => {
  it("returns [] without querying when given no ids", async () => {
    const db = fakeDb([]);
    const result = await countActiveApplicationsByJobIds(db, []);
    expect(result).toEqual(new Map());
    expect(db.query).not.toHaveBeenCalled();
  });

  it("groups counts by job_id, excluding soft-deleted", async () => {
    const db = fakeDb([
      [
        { job_id: "job-1", count: "3" },
        { job_id: "job-2", count: "1" },
      ],
    ]);

    const result = await countActiveApplicationsByJobIds(db, ["job-1", "job-2"]);

    expect(result).toEqual(
      new Map([
        ["job-1", 3],
        ["job-2", 1],
      ]),
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE deleted_at IS NULL AND job_id = ANY($1::uuid[])"),
      [["job-1", "job-2"]],
    );
  });
});

describe("getCampaignAppliedById", () => {
  it("filters out soft-deleted rows", async () => {
    const row = { id: "app-1" };
    const db = fakeDb([[row]]);

    const result = await getCampaignAppliedById(db, "app-1");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `SELECT * FROM campaign_applied WHERE id = $1 AND deleted_at IS NULL`,
      ["app-1"],
    );
  });
});

describe("listCampaignAppliedByIds", () => {
  it("returns [] without querying when given no ids", async () => {
    const db = fakeDb([]);
    const result = await listCampaignAppliedByIds(db, []);
    expect(result).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("batches by ANY($1) and excludes soft-deleted", async () => {
    const rows = [{ id: "app-1" }, { id: "app-2" }];
    const db = fakeDb([rows]);

    const result = await listCampaignAppliedByIds(db, ["app-1", "app-2"]);

    expect(result).toEqual(rows);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL"),
      [["app-1", "app-2"]],
    );
  });
});

describe("listCampaignAppliedByCandidate", () => {
  it("paginates and strips the window total from rows", async () => {
    const db = fakeDb([
      [
        { id: "app-1", total_count: "1" },
      ],
    ]);

    const result = await listCampaignAppliedByCandidate(db, "cand-1", {
      limit: 10,
      offset: 0,
    });

    expect(result).toEqual({
      rows: [{ id: "app-1" }],
      total: 1,
      limit: 10,
      offset: 0,
    });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE candidate_id = $1 AND deleted_at IS NULL"),
      ["cand-1", 10, 0],
    );
  });
});

describe("listCampaignAppliedByJob", () => {
  it("adds stage/sub-state filters with correctly numbered placeholders", async () => {
    const db = fakeDb([[]]);

    await listCampaignAppliedByJob(db, "job-1", {
      currentJobStageMappingId: "stage-1",
      currentSubStateId: "sub-1",
      limit: 20,
      offset: 40,
    });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("job_id = $1");
    expect(sql).toContain("current_job_stage_mapping_id = $2");
    expect(sql).toContain("current_sub_state_id = $3");
    expect(values).toEqual(["job-1", "stage-1", "sub-1", 20, 40]);
  });

  it("omits stage filters when not provided", async () => {
    const db = fakeDb([[]]);

    await listCampaignAppliedByJob(db, "job-1", {});

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).not.toContain("current_job_stage_mapping_id");
    expect(values).toEqual(["job-1", 50, 0]);
  });
});

describe("createCampaignApplied", () => {
  it("defaults source to Other when omitted", async () => {
    const row = { id: "app-1" };
    const db = fakeDb([[row]]);

    const result = await createCampaignApplied(db, {
      candidateId: "cand-1",
      jobId: "job-1",
    });

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO campaign_applied"), [
      "cand-1",
      "job-1",
      null,
      null,
      null,
    ]);
  });
});

describe("updateCampaignApplied", () => {
  it("updates only provided fields", async () => {
    const row = { id: "app-1", jd_match_status: "completed" };
    const db = fakeDb([[row]]);

    const result = await updateCampaignApplied(db, "app-1", {
      jdMatchStatus: "completed",
      jdMatchScore: 90,
    });

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `UPDATE campaign_applied
     SET jd_match_score = $2, jd_match_status = $3, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
      ["app-1", 90, "completed"],
    );
  });

  it("adds an active_cv_version_id guard clause with a correctly numbered placeholder when guardActiveCvVersionId is given", async () => {
    const row = { id: "app-1", jd_match_status: "completed" };
    const db = fakeDb([[row]]);

    const result = await updateCampaignApplied(
      db,
      "app-1",
      { jdMatchStatus: "completed", jdMatchScore: 90 },
      { guardActiveCvVersionId: "cv-5" },
    );

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `UPDATE campaign_applied
     SET jd_match_score = $2, jd_match_status = $3, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL AND active_cv_version_id = $4
     RETURNING *`,
      ["app-1", 90, "completed", "cv-5"],
    );
  });

  it("returns null (no-op) when the guarded active_cv_version_id no longer matches (superseded by a newer CV version)", async () => {
    // Simulates the race this guard exists for: a second duplicate CV merged
    // into this application and moved active_cv_version_id on before this
    // (slower) scoring call's write landed.
    const db = fakeDb([[]]);

    const result = await updateCampaignApplied(
      db,
      "app-1",
      { jdMatchStatus: "completed" },
      { guardActiveCvVersionId: "stale-cv-id" },
    );

    expect(result).toBeNull();
  });

  it("omits the guard clause when guardActiveCvVersionId is not given", async () => {
    const db = fakeDb([[{ id: "app-1" }]]);

    await updateCampaignApplied(db, "app-1", { jdMatchStatus: "completed" });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).not.toContain("active_cv_version_id");
    expect(values).toEqual(["app-1", "completed"]);
  });
});

describe("lockCampaignAppliedForJdMatch", () => {
  it("acquires the lock and returns the row when it succeeds", async () => {
    const row = { id: "app-1", jd_match_status: "processing" };
    const db = fakeDb([[row]]);

    const result = await lockCampaignAppliedForJdMatch(db, "app-1", [
      "pending",
      "failed",
      "skipped",
    ]);

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("SET jd_match_status = 'processing', jd_match_error = NULL"),
      ["app-1", ["pending", "failed", "skipped"]],
    );
    expect(db.query.mock.calls[0][0]).toContain(
      "jd_match_status = ANY($2::text[])",
    );
  });

  it("returns null when the row is not in an allowed state (lost race)", async () => {
    const db = fakeDb([[]]);

    const result = await lockCampaignAppliedForJdMatch(db, "app-1", ["pending"]);

    expect(result).toBeNull();
  });
});

describe("softDeleteCampaignApplied", () => {
  it("sets deleted_at", async () => {
    const row = { id: "app-1" };
    const db = fakeDb([[row]]);

    const result = await softDeleteCampaignApplied(db, "app-1");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("SET deleted_at = now(), updated_at = now()"),
      ["app-1"],
    );
  });
});

describe("setActiveCvVersion", () => {
  it("points active_cv_version_id at the given version id", async () => {
    const row = { id: "app-1", active_cv_version_id: "5" };
    const db = fakeDb([[row]]);

    const result = await setActiveCvVersion(db, "app-1", "5");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("SET active_cv_version_id = $2"),
      ["app-1", "5"],
    );
  });
});

describe("createApplicationWithInitialCv", () => {
  it("inserts campaign_applied, then version-1 cv_detail_versions, then wires active_cv_version_id", async () => {
    const application = { id: "app-1" };
    const cvVersion = { id: "cv-1" };
    const updatedApplication = { id: "app-1", active_cv_version_id: "cv-1" };
    const db = fakeDb([[application], [cvVersion], [updatedApplication]]);

    const buildCvStoragePath = vi.fn((applicationId: string) => `cv/cand-1/${applicationId}/foo_abc12345.pdf`);
    const result = await createApplicationWithInitialCv(db, {
      candidateId: "cand-1",
      jobId: "job-1",
      cv: {
        sourceEvent: "initial_upload",
        buildCvStoragePath,
      },
    });

    expect(result).toEqual({
      application: updatedApplication,
      cvVersion,
    });
    expect(db.query).toHaveBeenCalledTimes(3);

    const [insertAppSql, insertAppValues] = db.query.mock.calls[0];
    expect(insertAppSql).toContain("INSERT INTO campaign_applied");
    expect(insertAppValues).toEqual(["cand-1", "job-1", null, null, null]);

    expect(buildCvStoragePath).toHaveBeenCalledWith("app-1");

    const [insertCvSql, insertCvValues] = db.query.mock.calls[1];
    expect(insertCvSql).toContain("INSERT INTO cv_detail_versions");
    expect(insertCvValues[0]).toBe("app-1");
    expect(insertCvValues[1]).toBe(1);
    expect(insertCvValues[2]).toBe("initial_upload");
    expect(insertCvValues[3]).toBe("cv/cand-1/app-1/foo_abc12345.pdf");

    const [setActiveSql, setActiveValues] = db.query.mock.calls[2];
    expect(setActiveSql).toContain("SET active_cv_version_id = $2");
    expect(setActiveValues).toEqual(["app-1", "cv-1"]);
  });

  it("falls back to the unmodified application row if the active-version update returns no row", async () => {
    const application = { id: "app-1" };
    const cvVersion = { id: "cv-1" };
    const db = fakeDb([[application], [cvVersion], []]);

    const result = await createApplicationWithInitialCv(db, {
      candidateId: "cand-1",
      jobId: "job-1",
      cv: { sourceEvent: "initial_upload", buildCvStoragePath: () => "cv/cand-1/app-1/foo_abc12345.pdf" },
    });

    expect(result.application).toEqual(application);
  });
});
