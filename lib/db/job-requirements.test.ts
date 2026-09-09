import { describe, expect, it, vi } from "vitest";

import {
  countJobRequirements,
  listJobRequirements,
  replaceExtractedJobRequirements,
} from "@/lib/db/job-requirements";

function fakeDb(queuedRows: unknown[][]) {
  const query = vi.fn();
  for (const rows of queuedRows) {
    query.mockResolvedValueOnce({ rows });
  }
  return { query };
}

describe("listJobRequirements", () => {
  it("orders must-haves before nice-to-haves before bonuses", async () => {
    const db = fakeDb([[]]);
    await listJobRequirements(db, "job-1");

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("WHERE job_id = $1");
    expect(sql).toContain("WHEN 'must_have' THEN 0");
    expect(sql).toContain("WHEN 'nice_to_have' THEN 1");
    expect(values).toEqual(["job-1"]);
  });
});

describe("replaceExtractedJobRequirements", () => {
  it("clears the job's whole checklist before reinserting", async () => {
    const db = fakeDb([[], []]);
    await replaceExtractedJobRequirements(db, "job-1", [
      { requirement: "5+ years React", importance: "must_have", origin: "jd" },
    ]);

    const [deleteSql, deleteValues] = db.query.mock.calls[0];
    expect(deleteSql).toContain("DELETE FROM job_requirements");
    expect(deleteValues).toEqual(["job-1"]);
  });

  it("skips the insert entirely when the extractor returned nothing", async () => {
    const db = fakeDb([[]]);
    const result = await replaceExtractedJobRequirements(db, "job-1", []);

    expect(result).toEqual([]);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("bulk-inserts through unnest as column-wise arrays", async () => {
    const db = fakeDb([[], []]);
    await replaceExtractedJobRequirements(db, "job-1", [
      { requirement: "5+ years React", importance: "must_have", origin: "jd" },
      { requirement: "IELTS 7.0", importance: "nice_to_have", origin: "criteria" },
      { requirement: "People management", importance: "bonus", origin: "ai_inferred" },
    ]);

    expect(db.query).toHaveBeenCalledTimes(2);
    const [insertSql, insertValues] = db.query.mock.calls[1];
    expect(insertSql).toContain("unnest($2::text[], $3::text[], $4::text[])");
    expect(insertValues).toEqual([
      "job-1",
      ["5+ years React", "IELTS 7.0", "People management"],
      ["must_have", "nice_to_have", "bonus"],
      ["jd", "criteria", "ai_inferred"],
    ]);
  });
});

describe("countJobRequirements", () => {
  it("coerces the bigint count text back to a number", async () => {
    const db = fakeDb([[{ count: "12" }]]);
    expect(await countJobRequirements(db, "job-1")).toBe(12);
  });

  it("returns 0 when the count row is missing", async () => {
    const db = fakeDb([[]]);
    expect(await countJobRequirements(db, "job-1")).toBe(0);
  });
});
