import { describe, expect, it, vi } from "vitest";

import {
  createCandidate,
  getCandidateById,
  listCandidatePool,
  listCandidates,
  softDeleteCandidate,
  softDeleteCandidates,
  softDeleteOrphanedCandidates,
  syncCandidateAggregateFields,
  syncCandidateFieldsFromLatestCv,
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
  it("selects a non-deleted candidate by id, with CV-detail fields from the latest CV version", async () => {
    const row = {
      id: "c1",
      name: "Ada",
      gpa: "3.8",
      english_level: "IELTS 7.5",
      date_of_birth: "1990-01-01",
    };
    const db = fakeDb([row]);

    const result = await getCandidateById(db, "c1");

    expect(result).toEqual(row);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("FROM candidates c");
    expect(sql).toContain("LEFT JOIN LATERAL");
    expect(sql).toContain("FROM cv_detail_versions v");
    expect(sql).toContain("ca.candidate_id = c.id");
    expect(sql).toContain("ORDER BY v.created_at DESC");
    expect(sql).toContain("WHERE c.id = $1 AND c.deleted_at IS NULL");
    expect(params).toEqual(["c1"]);
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

describe("listCandidatePool", () => {
  it("queries only the candidates table, newest first, with default pagination", async () => {
    const db = fakeDb([]);

    const result = await listCandidatePool(db);

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("FROM candidates");
    expect(sql).not.toContain("JOIN");
    expect(sql).toContain("WHERE deleted_at IS NULL");
    expect(sql).toContain("ORDER BY created_at DESC, id DESC");
    expect(sql).toContain("FILTER (WHERE experience_years >= $1)");
    expect(values).toEqual([5, 50, 0]);
    expect(result).toEqual({
      rows: [],
      total: 0,
      experiencedTotal: 0,
      limit: 50,
      offset: 0,
    });
  });

  it("adds a single free-text filter spanning name/email/phone/role/degree/skills", async () => {
    const db = fakeDb([]);

    await listCandidatePool(db, { q: "engineer", limit: 10, offset: 5 });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain(
      "(name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1 OR role ILIKE $1 OR degree ILIKE $1 OR array_to_string(skills, ' ') ILIKE $1)",
    );
    expect(sql).toContain("FILTER (WHERE experience_years >= $2)");
    expect(values).toEqual(["%engineer%", 5, 10, 5]);
  });

  it("adds an inclusive upload-date range filter against created_at", async () => {
    const db = fakeDb([]);

    await listCandidatePool(db, {
      uploadFrom: "2026-01-01",
      uploadTo: "2026-01-31",
    });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("created_at >= $1");
    expect(sql).toContain("created_at < ($2::date + 1)");
    expect(values).toEqual(["2026-01-01", "2026-01-31", 5, 50, 0]);
  });

  it("extracts total + experienced count from the window counts and strips them from returned rows", async () => {
    const db = fakeDb([
      { id: "c1", name: "Ada", total_count: "2", experienced_count: "1" },
      { id: "c2", name: "Bob", total_count: "2", experienced_count: "1" },
    ]);

    const result = await listCandidatePool(db);

    expect(result.total).toBe(2);
    expect(result.experiencedTotal).toBe(1);
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
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("FROM candidates c");
    expect(sql).toContain("WHERE c.id = $1 AND c.deleted_at IS NULL");
    expect(params).toEqual(["c1"]);
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

describe("softDeleteCandidates", () => {
  it("returns [] without querying when given no ids", async () => {
    const db = fakeDb([]);
    const result = await softDeleteCandidates(db, []);
    expect(result).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("unconditionally soft-deletes every given candidate by id", async () => {
    const rows = [{ id: "c1" }, { id: "c2" }];
    const db = fakeDb(rows);

    const result = await softDeleteCandidates(db, ["c1", "c2"]);

    expect(result).toEqual(rows);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL");
    expect(sql).not.toContain("NOT EXISTS");
    expect(values).toEqual([["c1", "c2"]]);
  });
});

describe("softDeleteOrphanedCandidates", () => {
  it("returns [] without querying when given no ids", async () => {
    const db = fakeDb([]);
    const result = await softDeleteOrphanedCandidates(db, []);
    expect(result).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("soft-deletes only candidates left with zero live applications", async () => {
    const rows = [{ id: "c1", deleted_at: "2026-07-30T00:00:00Z" }];
    const db = fakeDb(rows);

    const result = await softDeleteOrphanedCandidates(db, ["c1", "c2"]);

    expect(result).toEqual(rows);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("NOT EXISTS"),
      [["c1", "c2"]],
    );
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
    expect(updateValues[6]).toBe("ADA LOVELACE");
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

describe("syncCandidateFieldsFromLatestCv", () => {
  it("does nothing when the candidate has no applications with an active CV", async () => {
    const db = fakeSequentialDb([[]]);

    await syncCandidateFieldsFromLatestCv(db, "c1");

    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("selects only the latest CV version (query is LIMIT 1) and writes its skills/experience/role/degree/education as-is, without aggregating across applications", async () => {
    const db = fakeSequentialDb([
      [
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

    await syncCandidateFieldsFromLatestCv(db, "c1");

    expect(db.query).toHaveBeenCalledTimes(2);
    const [selectSql] = db.query.mock.calls[0];
    expect(selectSql).toContain("LIMIT 1");
    const [updateSql, updateValues] = db.query.mock.calls[1];
    expect(updateSql).toContain("UPDATE candidates");
    expect(updateValues[0]).toBe("c1");
    expect(updateValues[1]).toEqual(["TypeScript", "Node.js"]);
    expect(updateValues[2]).toBe("5");
    expect(updateValues[3]).toBe("Backend Engineer");
    expect(updateValues[4]).toBe("MSc");
    expect(updateValues[5]).toBe("Stanford");
  });

  it("does not touch name/email/phone (never reads parsed_payload)", async () => {
    const db = fakeSequentialDb([
      [
        {
          skills: [],
          experience_years: null,
          role: null,
          degree: null,
          education: null,
        },
      ],
      [],
    ]);

    await syncCandidateFieldsFromLatestCv(db, "c1");

    const [selectSql] = db.query.mock.calls[0];
    expect(selectSql).not.toContain("parsed_payload");
    const [updateSql, updateValues] = db.query.mock.calls[1];
    expect(updateSql).not.toContain("name");
    expect(updateSql).not.toContain("email");
    expect(updateSql).not.toContain("phone");
    expect(updateValues).toHaveLength(6);
  });

  it("skips the SELECT entirely when cvData is passed directly", async () => {
    const db = fakeSequentialDb([[]]);

    await syncCandidateFieldsFromLatestCv(db, "c1", {
      skills: ["Go", " "],
      experience_years: "2",
      role: "SRE",
      degree: null,
      education: null,
    });

    expect(db.query).toHaveBeenCalledTimes(1);
    const [updateSql, updateValues] = db.query.mock.calls[0];
    expect(updateSql).toContain("UPDATE candidates");
    expect(updateValues[0]).toBe("c1");
    expect(updateValues[1]).toEqual(["Go"]);
    expect(updateValues[2]).toBe("2");
    expect(updateValues[3]).toBe("SRE");
  });
});
