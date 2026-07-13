import { describe, expect, it, vi } from "vitest";

import {
  countJobsByStatus,
  createJob,
  getJobById,
  listJobs,
  softDeleteJob,
  updateJob,
} from "@/lib/db/jobs";

function fakeDb(rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query };
}

describe("getJobById", () => {
  it("selects a non-deleted job by id", async () => {
    const row = { id: "job-1", position: "Backend Engineer" };
    const db = fakeDb([row]);

    const result = await getJobById(db, "job-1");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `SELECT * FROM jobs WHERE id = $1 AND deleted_at IS NULL`,
      ["job-1"],
    );
  });
});

describe("listJobs", () => {
  it("filters by status and q with correct placeholders", async () => {
    const db = fakeDb([]);

    await listJobs(db, { status: "Hiring", q: "engineer", limit: 20 });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("status = $1");
    expect(sql).toContain("position ILIKE $2");
    expect(values).toEqual(["Hiring", "%engineer%", 20, 0]);
  });

  it("defaults to no filters beyond deleted_at", async () => {
    const db = fakeDb([]);

    await listJobs(db);

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("WHERE deleted_at IS NULL");
    expect(values).toEqual([50, 0]);
  });
  it("filters by start_date range", async () => {
    const db = fakeDb([]);

    await listJobs(db, { startFrom: "2026-01-01", startTo: "2026-03-31" });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("start_date >= $1");
    expect(sql).toContain("start_date <= $2");
    expect(values).toEqual(["2026-01-01", "2026-03-31", 50, 0]);
  });
});

describe("countJobsByStatus", () => {
  it("groups by status, defaulting missing statuses to 0", async () => {
    const db = fakeDb([
      { status: "Hiring", count: "3" },
      { status: "Pending", count: "1" },
    ]);

    const result = await countJobsByStatus(db);

    expect(result).toEqual({ Pending: 1, Hiring: 3, Done: 0, Closed: 0 });
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("WHERE deleted_at IS NULL");
    expect(sql).toContain("GROUP BY status");
    expect(values).toEqual([]);
  });

  it("scopes by q and date range but not status", async () => {
    const db = fakeDb([]);

    await countJobsByStatus(db, {
      q: "engineer",
      startFrom: "2026-01-01",
      startTo: "2026-03-31",
    });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("position ILIKE $1");
    expect(sql).toContain("start_date >= $2");
    expect(sql).toContain("start_date <= $3");
    expect(values).toEqual(["%engineer%", "2026-01-01", "2026-03-31"]);
  });
});

describe("createJob", () => {
  it("defaults status to Pending when omitted", async () => {
    const row = { id: "job-1", position: "Backend Engineer", status: "Pending" };
    const db = fakeDb([row]);

    const result = await createJob(db, { position: "Backend Engineer" });

    expect(result).toEqual(row);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("COALESCE($2, 'Pending')");
    expect(values[0]).toBe("Backend Engineer");
    expect(values[1]).toBeNull();
  });
  it("passes updateNote and jd file fields through to the insert", async () => {
    const row = { id: "job-1" };
    const db = fakeDb([row]);

    await createJob(db, {
      position: "Backend Engineer",
      updateNote: "Reopened after budget approval",
      jdStoragePath: "jd/abc.pdf",
    });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("update_note");
    expect(values).toContain("Reopened after budget approval");
    expect(values).toContain("jd/abc.pdf");
  });
});

describe("updateJob", () => {
  it("updates only provided fields", async () => {
    const row = { id: "job-1", status: "Closed" };
    const db = fakeDb([row]);

    const result = await updateJob(db, "job-1", { status: "Closed" });

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `UPDATE jobs
     SET status = $2, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
      ["job-1", "Closed"],
    );
  });

  it("falls back to a plain select when the patch is empty", async () => {
    const row = { id: "job-1" };
    const db = fakeDb([row]);

    const result = await updateJob(db, "job-1", {});

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `SELECT * FROM jobs WHERE id = $1 AND deleted_at IS NULL`,
      ["job-1"],
    );
  });
});

describe("softDeleteJob", () => {
  it("sets deleted_at", async () => {
    const row = { id: "job-1" };
    const db = fakeDb([row]);

    const result = await softDeleteJob(db, "job-1");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("SET deleted_at = now(), updated_at = now()"),
      ["job-1"],
    );
  });
});
