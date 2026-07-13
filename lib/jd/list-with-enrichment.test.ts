import { describe, expect, it, vi } from "vitest";

import {
  defaultJdStartDateRangeIso,
  queryJobDescriptionsWithEnrichment,
} from "@/lib/jd/list-with-enrichment";

function fakeDb() {
  const query = vi.fn();
  query.mockImplementation((sql: string) => {
    if (sql.includes("FROM jobs") && sql.includes("count(*) OVER()")) {
      return Promise.resolve({
        rows: [
          {
            id: "job-1",
            position: "Backend",
            status: "Hiring",
            jd_storage_path: "jd/a.pdf",
            start_date: new Date("2026-01-15"),
            end_date: null,
            hiring_deadline: new Date("2026-02-01"),
            created_at: new Date("2026-01-01T00:00:00Z"),
            updated_at: new Date("2026-01-02T00:00:00Z"),
            total_count: "2",
          },
          {
            id: "job-2",
            position: "Frontend",
            status: "Hiring",
            jd_storage_path: null,
            start_date: null,
            end_date: null,
            hiring_deadline: null,
            created_at: new Date("2026-01-03T00:00:00Z"),
            updated_at: new Date("2026-01-04T00:00:00Z"),
            total_count: "2",
          },
        ],
      });
    }
    if (sql.includes("GROUP BY status")) {
      return Promise.resolve({ rows: [{ status: "Hiring", count: "2" }] });
    }
    if (sql.includes("FROM campaign_applied")) {
      return Promise.resolve({ rows: [{ job_id: "job-1", count: "3" }] });
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  return { query };
}

describe("defaultJdStartDateRangeIso", () => {
  it("returns `to` as today (UTC) and `from` as 3 months earlier", () => {
    const { from, to } = defaultJdStartDateRangeIso();

    const now = new Date();
    const expectedTo = now.toISOString().slice(0, 10);
    const expectedFrom = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, now.getUTCDate()),
    )
      .toISOString()
      .slice(0, 10);

    expect(to).toBe(expectedTo);
    expect(from).toBe(expectedFrom);
    expect(from < to).toBe(true);
  });

  it("returns YYYY-MM-DD formatted strings", () => {
    const { from, to } = defaultJdStartDateRangeIso();
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("queryJobDescriptionsWithEnrichment", () => {
  it("enriches rows with applicant_count and has_jd_source_file, and returns pagination/statusCounts", async () => {
    const db = fakeDb();

    const result = await queryJobDescriptionsWithEnrichment(db, {
      limit: 10,
      offset: 0,
    });

    expect(result.jobDescriptions).toEqual([
      expect.objectContaining({
        id: "job-1",
        applicant_count: 3,
        has_jd_source_file: true,
        start_date: "2026-01-15",
        end_date: null,
        hiring_deadline: "2026-02-01",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
      }),
      expect.objectContaining({
        id: "job-2",
        applicant_count: 0,
        has_jd_source_file: false,
        start_date: null,
        end_date: null,
        hiring_deadline: null,
      }),
    ]);
    // Every date field is a plain string, never a Date instance -- this is
    // what a Server Component -> use() promise pass would otherwise skip
    // (see the JobDescriptionListRow doc comment).
    for (const jd of result.jobDescriptions) {
      expect(typeof jd.created_at).toBe("string");
      expect(typeof jd.updated_at).toBe("string");
    }
    expect(result.pagination).toEqual({ total: 2, limit: 10, offset: 0 });
    expect(result.statusCounts).toEqual({
      Pending: 0,
      Hiring: 2,
      Done: 0,
      Closed: 0,
    });
  });

  it("returns null pagination when limit is omitted", async () => {
    const db = fakeDb();
    const result = await queryJobDescriptionsWithEnrichment(db, {});
    expect(result.pagination).toBeNull();
  });

  it("skips the applicant-count query when there are no jobs", async () => {
    const query = vi.fn();
    query.mockImplementation((sql: string) => {
      if (sql.includes("count(*) OVER()")) return Promise.resolve({ rows: [] });
      if (sql.includes("GROUP BY status")) return Promise.resolve({ rows: [] });
      throw new Error(`Unexpected query: ${sql}`);
    });
    const result = await queryJobDescriptionsWithEnrichment(
      { query },
      { limit: 10 },
    );
    expect(result.jobDescriptions).toEqual([]);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
