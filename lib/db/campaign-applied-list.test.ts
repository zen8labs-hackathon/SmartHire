import { describe, expect, it, vi } from "vitest";

import {
  countCampaignAppliedByStageForJob,
  getCampaignAppliedAdminRowById,
  listApplicationsForCandidate,
  listCampaignAppliedForAdmin,
  listOtherApplicationsForCandidate,
} from "@/lib/db/campaign-applied-list";

function fakeDb(rows: unknown[]) {
  const query = vi.fn().mockResolvedValueOnce({ rows });
  return { query };
}

describe("getCampaignAppliedAdminRowById", () => {
  it("returns the row when found", async () => {
    const row = { id: "app-1" };
    const db = fakeDb([row]);

    const result = await getCampaignAppliedAdminRowById(db, "app-1");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE ca.id = $1 AND ca.deleted_at IS NULL"),
      ["app-1"],
    );
  });

  it("returns null when not found", async () => {
    const db = fakeDb([]);

    const result = await getCampaignAppliedAdminRowById(db, "missing");

    expect(result).toBeNull();
  });
});

describe("listCampaignAppliedForAdmin", () => {
  it("paginates and strips the window total from rows", async () => {
    const db = fakeDb([{ id: "app-1", total_count: "1" }]);

    const result = await listCampaignAppliedForAdmin(db, { limit: 10, offset: 0 });

    expect(result).toEqual({
      rows: [{ id: "app-1" }],
      total: 1,
      limit: 10,
      offset: 0,
    });
  });

  it("returns an empty page without erroring when there are no matches", async () => {
    const db = fakeDb([]);

    const result = await listCampaignAppliedForAdmin(db, {});

    expect(result).toEqual({ rows: [], total: 0, limit: 50, offset: 0 });
  });

  it("filters by jobId", async () => {
    const db = fakeDb([]);

    await listCampaignAppliedForAdmin(db, { jobId: "job-1" });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("ca.job_id = $1"),
      expect.arrayContaining(["job-1"]),
    );
  });

  it("requires both stageMappingId and subStateId together", async () => {
    const db = fakeDb([]);

    await listCampaignAppliedForAdmin(db, { stageMappingId: "stage-1" });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).not.toContain("ca.current_job_stage_mapping_id = $");
    expect(values).not.toContain("stage-1");
  });

  it("applies both stage filters when both ids are present", async () => {
    const db = fakeDb([]);

    await listCampaignAppliedForAdmin(db, {
      stageMappingId: "stage-1",
      subStateId: "sub-1",
    });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("ca.current_job_stage_mapping_id = $1"),
      expect.arrayContaining(["stage-1", "sub-1"]),
    );
    expect(db.query.mock.calls[0][0]).toContain("ca.current_sub_state_id = $2");
  });

  it("builds an ILIKE OR clause across name and school for q", async () => {
    const db = fakeDb([]);

    await listCampaignAppliedForAdmin(db, { q: "engineer" });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("c.name ILIKE $1");
    expect(sql).toContain("c.education ILIKE $1");
    expect(values[0]).toBe("%engineer%");
  });

  it("applies upload date range against COALESCE(cv.created_at, ca.created_at)", async () => {
    const db = fakeDb([]);

    await listCampaignAppliedForAdmin(db, {
      uploadFrom: "2026-01-01",
      uploadTo: "2026-01-31",
    });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("COALESCE(cv.created_at, ca.created_at) >= $1");
    expect(sql).toContain("COALESCE(cv.created_at, ca.created_at) < ($2::date + 1)");
    expect(values.slice(0, 2)).toEqual(["2026-01-01", "2026-01-31"]);
  });
});

describe("listOtherApplicationsForCandidate", () => {
  it("excludes the given application and filters by candidate", async () => {
    const rows = [{ id: "app-2" }];
    const db = fakeDb(rows);

    const result = await listOtherApplicationsForCandidate(db, "cand-1", "app-1");

    expect(result).toEqual(rows);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE ca.candidate_id = $1 AND ca.id != $2 AND ca.deleted_at IS NULL"),
      ["cand-1", "app-1"],
    );
  });

  it("selects the raw pipeline-position columns needed to resolve a stage fallback", async () => {
    const db = fakeDb([]);

    await listOtherApplicationsForCandidate(db, "cand-1", "app-1");

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("ca.current_job_stage_mapping_id, ca.current_sub_state_id");
    expect(sql).toContain("ps.label AS stage_label");
    expect(sql).toContain("pss.label AS sub_stage_label");
  });
});

describe("listApplicationsForCandidate", () => {
  it("includes every application for the candidate, with no exclusion filter", async () => {
    const rows = [{ id: "app-1" }, { id: "app-2" }];
    const db = fakeDb(rows);

    const result = await listApplicationsForCandidate(db, "cand-1");

    expect(result).toEqual(rows);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE ca.candidate_id = $1 AND ca.deleted_at IS NULL"),
      ["cand-1"],
    );
    const [sql] = db.query.mock.calls[0];
    expect(sql).not.toContain("ca.id !=");
  });
});

describe("countCampaignAppliedByStageForJob", () => {
  it("coerces the count column to a number and scopes by job", async () => {
    const db = fakeDb([
      {
        stage_code: "screening",
        stage_label: "Screening",
        sub_stage_code: "new",
        sub_stage_label: "New",
        count: "3",
      },
      {
        stage_code: "interview",
        stage_label: "Interview",
        sub_stage_code: "passed",
        sub_stage_label: "Passed",
        count: "0",
      },
    ]);

    const result = await countCampaignAppliedByStageForJob(db, "job-1");

    expect(result).toEqual([
      {
        stage_code: "screening",
        stage_label: "Screening",
        sub_stage_code: "new",
        sub_stage_label: "New",
        count: 3,
      },
      {
        stage_code: "interview",
        stage_label: "Interview",
        sub_stage_code: "passed",
        sub_stage_label: "Passed",
        count: 0,
      },
    ]);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE jsm.job_id = $1 AND jsm.deleted_at IS NULL"),
      ["job-1"],
    );
  });

  it("returns an empty array when the job has no stage mappings", async () => {
    const db = fakeDb([]);

    const result = await countCampaignAppliedByStageForJob(db, "job-1");

    expect(result).toEqual([]);
  });
});
