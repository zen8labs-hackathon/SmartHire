import { describe, expect, it, vi } from "vitest";

import {
  createCvDetailVersion,
  getCvDetailVersionById,
  getNextCvVersionNumber,
  listCvDetailVersionsByCampaignApplied,
  listRecentCvDetailVersionsForAdmin,
  updateCvDetailVersionJdMatchResult,
  updateCvDetailVersionParsingResult,
} from "@/lib/db/cv-detail-versions";

function fakeDb(rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query };
}

describe("getCvDetailVersionById", () => {
  it("selects by id with no soft-delete filter (table has no deleted_at)", async () => {
    const row = { id: "1" };
    const db = fakeDb([row]);

    const result = await getCvDetailVersionById(db, "1");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `SELECT * FROM cv_detail_versions WHERE id = $1`,
      ["1"],
    );
  });
});

describe("listCvDetailVersionsByCampaignApplied", () => {
  it("orders by version_number descending", async () => {
    const db = fakeDb([{ id: "2" }, { id: "1" }]);

    const result = await listCvDetailVersionsByCampaignApplied(db, "app-1");

    expect(result).toEqual([{ id: "2" }, { id: "1" }]);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY version_number DESC"),
      ["app-1"],
    );
  });
});

describe("listRecentCvDetailVersionsForAdmin", () => {
  it("orders by created_at descending and applies the limit", async () => {
    const rows = [{ id: "v-2" }, { id: "v-1" }];
    const db = fakeDb(rows);

    const result = await listRecentCvDetailVersionsForAdmin(db, 5);

    expect(result).toEqual(rows);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY cv.created_at DESC"),
      [5],
    );
  });
});

describe("getNextCvVersionNumber", () => {
  it("returns the computed next version", async () => {
    const db = fakeDb([{ next_version: 3 }]);

    const result = await getNextCvVersionNumber(db, "app-1");

    expect(result).toBe(3);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("COALESCE(MAX(version_number), 0) + 1"),
      ["app-1"],
    );
  });

  it("defaults to 1 when the query returns no row", async () => {
    const db = fakeDb([]);
    const result = await getNextCvVersionNumber(db, "app-1");
    expect(result).toBe(1);
  });
});

describe("createCvDetailVersion", () => {
  it("serializes parsed_payload to JSON and defaults skills to '{}'", async () => {
    const row = { id: "1", campaign_applied_id: "app-1" };
    const db = fakeDb([row]);

    const result = await createCvDetailVersion(db, {
      campaignAppliedId: "app-1",
      versionNumber: 1,
      sourceEvent: "initial_upload",
      parsedPayload: { name: "Ada" },
    });

    expect(result).toEqual(row);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("INSERT INTO cv_detail_versions");
    expect(values[0]).toBe("app-1");
    expect(values[1]).toBe(1);
    expect(values[2]).toBe("initial_upload");
    expect(values[10]).toBe(JSON.stringify({ name: "Ada" }));
    expect(values[11]).toBeNull();
  });
});

describe("updateCvDetailVersionParsingResult", () => {
  it("updates only the provided parsing fields", async () => {
    const row = { id: "1", parsing_status: "completed" };
    const db = fakeDb([row]);

    const result = await updateCvDetailVersionParsingResult(db, "1", {
      parsingStatus: "completed",
      skills: ["react"],
    });

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `UPDATE cv_detail_versions SET parsing_status = $2, skills = $3 WHERE id = $1 RETURNING *`,
      ["1", "completed", ["react"]],
    );
  });

  it("falls back to a plain select when the patch is empty", async () => {
    const row = { id: "1" };
    const db = fakeDb([row]);

    const result = await updateCvDetailVersionParsingResult(db, "1", {});

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `SELECT * FROM cv_detail_versions WHERE id = $1`,
      ["1"],
    );
  });
});

describe("updateCvDetailVersionJdMatchResult", () => {
  it("serializes jd_match_formula_breakdown and updates provided fields", async () => {
    const row = { id: "1", jd_match_score: 88 };
    const db = fakeDb([row]);

    const result = await updateCvDetailVersionJdMatchResult(db, "1", {
      jdMatchScore: 88,
      jdMatchFormulaBreakdown: { skillsMatch: 0.9 },
    });

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `UPDATE cv_detail_versions SET jd_match_score = $2, jd_match_formula_breakdown = $3 WHERE id = $1 RETURNING *`,
      ["1", 88, JSON.stringify({ skillsMatch: 0.9 })],
    );
  });
});
