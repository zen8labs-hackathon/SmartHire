import { describe, expect, it, vi } from "vitest";

import {
  dedupeMatchStatusLabel,
  findCandidatesByDedupeSignals,
  listDedupedCandidatesForAdmin,
} from "@/lib/db/candidates-dedupe";

function fakeDb(rows: unknown[]) {
  const query = vi.fn().mockResolvedValueOnce({ rows });
  return { query };
}

describe("findCandidatesByDedupeSignals", () => {
  it("returns [] without querying when no signal is given", async () => {
    const db = fakeDb([]);

    const result = await findCandidatesByDedupeSignals(db, {});

    expect(result).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("returns [] when phoneVariants is an empty array", async () => {
    const db = fakeDb([]);

    const result = await findCandidatesByDedupeSignals(db, { phoneVariants: [] });

    expect(result).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("lowercases email and passes phone variants/hashes positionally", async () => {
    const db = fakeDb([{ candidate_id: "c-1" }]);

    await findCandidatesByDedupeSignals(db, {
      email: "Foo@Example.com",
      phoneVariants: ["0912345678", "84912345678"],
      cvFileSha256: "filehash",
      cvContentSha256: "contenthash",
    });

    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      ["foo@example.com", ["0912345678", "84912345678"], "filehash", "contenthash"],
    );
  });

  it("adds an exclusion clause when excludeCampaignAppliedId is given", async () => {
    const db = fakeDb([]);

    await findCandidatesByDedupeSignals(db, { email: "a@b.com" }, "app-1");

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("ca.id != $5");
    expect(values[4]).toBe("app-1");
  });

  it("joins pipeline stage/sub-stage so callers can show the match's real status", async () => {
    const db = fakeDb([]);

    await findCandidatesByDedupeSignals(db, { email: "a@b.com" });

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("ps.label AS stage_label");
    expect(sql).toContain("pss.label AS sub_stage_label");
    expect(sql).toContain("LEFT JOIN pipeline_stages ps ON ps.id = jsm.pipeline_stage_id");
  });
});

describe("dedupeMatchStatusLabel", () => {
  it("returns New when the application has no stage assigned", () => {
    expect(
      dedupeMatchStatusLabel({ stage_label: null, sub_stage_label: null }),
    ).toBe("New");
  });

  it("combines stage and sub-stage labels", () => {
    expect(
      dedupeMatchStatusLabel({ stage_label: "Interview", sub_stage_label: "Passed" }),
    ).toBe("Interview · Passed");
  });

  it("falls back to just the stage label when there is no sub-stage", () => {
    expect(
      dedupeMatchStatusLabel({ stage_label: "Interview", sub_stage_label: null }),
    ).toBe("Interview");
  });
});

describe("listDedupedCandidatesForAdmin", () => {
  it("paginates and strips the window total from rows", async () => {
    const db = fakeDb([{ id: "cand-1", total_count: "1" }]);

    const result = await listDedupedCandidatesForAdmin(db, { limit: 10, offset: 0 });

    expect(result).toEqual({
      rows: [{ id: "cand-1" }],
      total: 1,
      limit: 10,
      offset: 0,
    });
  });

  it("returns an empty page without erroring when there are no matches", async () => {
    const db = fakeDb([]);

    const result = await listDedupedCandidatesForAdmin(db, {});

    expect(result).toEqual({ rows: [], total: 0, limit: 50, offset: 0 });
  });

  it("dedupes to the latest non-deleted application per candidate via DISTINCT ON", async () => {
    const db = fakeDb([]);

    await listDedupedCandidatesForAdmin(db, {});

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("SELECT DISTINCT ON (candidate_id) *");
    expect(sql).toContain("ORDER BY candidate_id, created_at DESC");
  });

  it("inner-joins latest_apps/jobs so a person with no live application is excluded, not surfaced with a null campaign_applied_id", async () => {
    const db = fakeDb([]);

    await listDedupedCandidatesForAdmin(db, {});

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("JOIN latest_apps la ON la.candidate_id = c.id");
    expect(sql).not.toContain("LEFT JOIN latest_apps");
    expect(sql).toContain("JOIN jobs j ON j.id = la.job_id");
    expect(sql).not.toContain("LEFT JOIN jobs");
  });

  it("joins pipeline stage/sub-stage labels instead of reusing jd_match_status as a placeholder", async () => {
    const db = fakeDb([]);

    await listDedupedCandidatesForAdmin(db, {});

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("ps.label AS stage_label");
    expect(sql).toContain("pss.label AS sub_stage_label");
  });

  it("builds an ILIKE OR clause across candidate and CV fields for q", async () => {
    const db = fakeDb([]);

    await listDedupedCandidatesForAdmin(db, { q: "engineer" });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("c.name ILIKE $1");
    expect(sql).toContain("cv.original_filename ILIKE $1");
    expect(values[0]).toBe("%engineer%");
  });

  it("applies upload date range against COALESCE(cv.created_at, la.created_at)", async () => {
    const db = fakeDb([]);

    await listDedupedCandidatesForAdmin(db, {
      uploadFrom: "2026-01-01",
      uploadTo: "2026-01-31",
    });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("COALESCE(cv.created_at, la.created_at) >= $1");
    expect(sql).toContain("COALESCE(cv.created_at, la.created_at) < ($2::date + 1)");
    expect(values.slice(0, 2)).toEqual(["2026-01-01", "2026-01-31"]);
  });
});
