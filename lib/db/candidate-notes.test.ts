import { describe, expect, it, vi } from "vitest";

import {
  createCandidateNote,
  getCandidateNoteById,
  listCandidateNotesByCampaignApplied,
  softDeleteCandidateNote,
  updateCandidateNoteBody,
} from "@/lib/db/candidate-notes";

function fakeDb(rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query };
}

describe("getCandidateNoteById", () => {
  it("filters out soft-deleted rows", async () => {
    const row = { id: "n1" };
    const db = fakeDb([row]);
    const result = await getCandidateNoteById(db, "n1");
    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `SELECT * FROM candidate_notes WHERE id = $1 AND deleted_at IS NULL`,
      ["n1"],
    );
  });
});

describe("listCandidateNotesByCampaignApplied", () => {
  it("lists all note types by default", async () => {
    const db = fakeDb([]);
    await listCandidateNotesByCampaignApplied(db, "app-1");
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE campaign_applied_id = $1 AND deleted_at IS NULL"),
      ["app-1"],
    );
  });

  it("adds a type filter when provided", async () => {
    const db = fakeDb([]);
    await listCandidateNotesByCampaignApplied(db, "app-1", "interview");
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("type = $2");
    expect(values).toEqual(["app-1", "interview"]);
  });
});

describe("createCandidateNote", () => {
  it("inserts with the given type and body", async () => {
    const row = { id: "n1", type: "general", body: "Looks good" };
    const db = fakeDb([row]);

    const result = await createCandidateNote(db, {
      campaignAppliedId: "app-1",
      type: "general",
      body: "Looks good",
      authorId: "u1",
    });

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO candidate_notes"),
      ["app-1", "general", "Looks good", "u1"],
    );
  });
});

describe("updateCandidateNoteBody", () => {
  it("updates body and updated_at", async () => {
    const row = { id: "n1", body: "Edited" };
    const db = fakeDb([row]);

    const result = await updateCandidateNoteBody(db, "n1", "Edited");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `UPDATE candidate_notes
     SET body = $2, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
      ["n1", "Edited"],
    );
  });
});

describe("softDeleteCandidateNote", () => {
  it("sets deleted_at", async () => {
    const db = fakeDb([{ id: "n1" }]);
    await softDeleteCandidateNote(db, "n1");
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("SET deleted_at = now(), updated_at = now()"),
      ["n1"],
    );
  });
});
