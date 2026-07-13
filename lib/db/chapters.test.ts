import { describe, expect, it, vi } from "vitest";

import {
  createChapter,
  deleteChapter,
  findExistingChapterIds,
  listChapters,
  updateChapterName,
} from "@/lib/db/chapters";

function fakeDb(rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query };
}

describe("listChapters", () => {
  it("orders by name", async () => {
    const db = fakeDb([]);
    await listChapters(db);
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("ORDER BY name ASC");
  });
});

describe("findExistingChapterIds", () => {
  it("returns [] without querying when given no ids", async () => {
    const db = fakeDb([]);
    const result = await findExistingChapterIds(db, []);
    expect(result).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("returns the ids that exist", async () => {
    const db = fakeDb([{ id: "c-1" }, { id: "c-2" }]);
    const result = await findExistingChapterIds(db, ["c-1", "c-2", "c-3"]);
    expect(result).toEqual(["c-1", "c-2"]);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id = ANY($1::uuid[])"),
      [["c-1", "c-2", "c-3"]],
    );
  });
});
describe("createChapter", () => {
  it("inserts and returns the new row", async () => {
    const row = { id: "c-1", name: "Engineering", created_at: new Date() };
    const db = fakeDb([row]);

    const result = await createChapter(db, "Engineering");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO chapters (name) VALUES ($1)"),
      ["Engineering"],
    );
  });
});

describe("updateChapterName", () => {
  it("updates and returns the row", async () => {
    const row = { id: "c-1", name: "New Name", created_at: new Date() };
    const db = fakeDb([row]);

    const result = await updateChapterName(db, "c-1", "New Name");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("SET name = $2"),
      ["c-1", "New Name"],
    );
  });

  it("returns null when the chapter doesn't exist", async () => {
    const db = fakeDb([]);
    expect(await updateChapterName(db, "missing", "X")).toBeNull();
  });
});

describe("deleteChapter", () => {
  it("hard-deletes by id", async () => {
    const db = fakeDb([]);
    await deleteChapter(db, "c-1");
    expect(db.query).toHaveBeenCalledWith(
      `DELETE FROM chapters WHERE id = $1`,
      ["c-1"],
    );
  });
});
