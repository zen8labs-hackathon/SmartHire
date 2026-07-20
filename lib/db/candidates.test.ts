import { describe, expect, it, vi } from "vitest";

import {
  createCandidate,
  getCandidateById,
  listCandidates,
  softDeleteCandidate,
  syncCandidateAggregateFields,
  updateCandidate,
} from "@/lib/db/candidates";

function fakeDb(rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query };
}

function fakeSequentialDb(queuedRows: unknown[][]) {
  const query = vi.fn();
  for (const rows of queuedRows) {
    query.mockResolvedValueOnce({ rows });
  }
  return { query };
}

describe("getCandidateById", () => {
  it("selects a non-deleted candidate by id", async () => {
    const row = { id: "c1", name: "Ada" };
    const db = fakeDb([row]);

    const result = await getCandidateById(db, "c1");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `SELECT * FROM candidates WHERE id = $1 AND deleted_at IS NULL`,
      ["c1"],
    );
  });

  it("returns null when no row matches", async () => {
    const db = fakeDb([]);
    const result = await getCandidateById(db, "missing");
    expect(result).toBeNull();
  });
});

describe("listCandidates", () => {
  it("applies default pagination with no filters", async () => {
    const db = fakeDb([]);

    const result = await listCandidates(db);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE deleted_at IS NULL"),
      [50, 0],
    );
    expect(result).toEqual({ rows: [], total: 0, limit: 50, offset: 0 });
  });

  it("adds email, phone, q, and skills filters with matching placeholders", async () => {
    const db = fakeDb([]);

    await listCandidates(db, {
      email: "Ada@Example.com",
      phone: "12345",
      q: "engineer",
      skills: ["react", "node"],
      limit: 10,
      offset: 5,
    });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("lower(email) = $1");
    expect(sql).toContain("phone = $2");
    expect(sql).toContain(
      "(name ILIKE $3 OR email ILIKE $3 OR role ILIKE $3)",
    );
    expect(sql).toContain("skills @> $4::text[]");
    expect(values).toEqual([
      "ada@example.com",
      "12345",
      "%engineer%",
      ["react", "node"],
      10,
      5,
    ]);
  });

  it("extracts total from the window count and strips it from returned rows", async () => {
    const db = fakeDb([
      { id: "c1", name: "Ada", total_count: "2" },
      { id: "c2", name: "Bob", total_count: "2" },
    ]);

    const result = await listCandidates(db);

    expect(result.total).toBe(2);
    expect(result.rows).toEqual([
      { id: "c1", name: "Ada" },
      { id: "c2", name: "Bob" },
    ]);
  });
});

describe("createCandidate", () => {
  it("inserts with defaults for omitted optional fields", async () => {
    const row = { id: "c1", name: "Ada" };
    const db = fakeDb([row]);

    const result = await createCandidate(db, { name: "Ada" });

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO candidates"), [
      "Ada",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

describe("updateCandidate", () => {
  it("builds a SET clause for provided fields only", async () => {
    const row = { id: "c1", role: "Engineer" };
    const db = fakeDb([row]);

    const result = await updateCandidate(db, "c1", { role: "Engineer" });

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `UPDATE candidates
     SET role = $2, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
      ["c1", "Engineer"],
    );
  });

  it("falls back to a plain select when the patch is empty", async () => {
    const row = { id: "c1" };
    const db = fakeDb([row]);

    const result = await updateCandidate(db, "c1", {});

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `SELECT * FROM candidates WHERE id = $1 AND deleted_at IS NULL`,
      ["c1"],
    );
  });
});

describe("softDeleteCandidate", () => {
  it("sets deleted_at and returns the updated row", async () => {
    const row = { id: "c1", deleted_at: "2026-07-13T00:00:00Z" };
    const db = fakeDb([row]);

    const result = await softDeleteCandidate(db, "c1");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("SET deleted_at = now(), updated_at = now()"),
      ["c1"],
    );
  });

  it("returns null when the candidate is already deleted or missing", async () => {
    const db = fakeDb([]);
    const result = await softDeleteCandidate(db, "missing");
    expect(result).toBeNull();
  });
});

describe("syncCandidateAggregateFields", () => {
  it("does nothing when the candidate has no applications with an active CV", async () => {
    const db = fakeSequentialDb([[]]);

    await syncCandidateAggregateFields(db, "c1");

    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("unions skills across applications, takes the max experience_years, and uses the latest row's role/degree/education", async () => {
    const db = fakeSequentialDb([
      [
        {
          skills: ["React", "TypeScript"],
          experience_years: "3",
          role: "Frontend Engineer",
          degree: "BSc",
          education: "MIT",
        },
        {
          skills: ["TypeScript", "Node.js", " "],
          experience_years: "5",
          role: "Backend Engineer",
          degree: "MSc",
          education: "Stanford",
        },
      ],
      [],
    ]);

    await syncCandidateAggregateFields(db, "c1");

    expect(db.query).toHaveBeenCalledTimes(2);
    const [updateSql, updateValues] = db.query.mock.calls[1];
    expect(updateSql).toContain("UPDATE candidates");
    expect(updateValues[0]).toBe("c1");
    expect(updateValues[1]).toEqual(
      expect.arrayContaining(["React", "TypeScript", "Node.js"]),
    );
    expect(updateValues[1]).toHaveLength(3);
    expect(updateValues[2]).toBe("5");
    expect(updateValues[3]).toBe("Frontend Engineer");
    expect(updateValues[4]).toBe("BSc");
    expect(updateValues[5]).toBe("MIT");
  });

  it("treats a non-numeric experience_years as 0 without throwing", async () => {
    const db = fakeSequentialDb([
      [{ skills: [], experience_years: "n/a", role: null, degree: null, education: null }],
      [],
    ]);

    await syncCandidateAggregateFields(db, "c1");

    const [, updateValues] = db.query.mock.calls[1];
    expect(updateValues[2]).toBeNull();
  });

  it("derives name/email/phone from the latest version's parsed_payload (the only place they're stored pre-aggregate)", async () => {
    const db = fakeSequentialDb([
      [
        {
          skills: [],
          experience_years: null,
          role: null,
          degree: null,
          education: null,
          parsed_payload: { name: "Ada Lovelace", email: "Ada@Example.com", phone: "0901234567" },
        },
      ],
      [],
    ]);

    await syncCandidateAggregateFields(db, "c1");

    const [, updateValues] = db.query.mock.calls[1];
    expect(updateValues[6]).toBe("Ada Lovelace");
    expect(updateValues[7]).toBe("Ada@Example.com");
    expect(updateValues[8]).toBe("0901234567");
  });

  it("sets name/email/phone to null when the latest version has no parsed_payload yet", async () => {
    const db = fakeSequentialDb([
      [{ skills: [], experience_years: null, role: null, degree: null, education: null, parsed_payload: null }],
      [],
    ]);

    await syncCandidateAggregateFields(db, "c1");

    const [, updateValues] = db.query.mock.calls[1];
    expect(updateValues[6]).toBeNull();
    expect(updateValues[7]).toBeNull();
    expect(updateValues[8]).toBeNull();
  });
});
