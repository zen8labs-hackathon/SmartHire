import { describe, expect, it, vi } from "vitest";

import {
  listChapterIdsForUser,
  listMembersOfChapter,
  listMembershipsForUser,
  listMembershipsForUsers,
  replaceMembershipsForUser,
} from "@/lib/db/profile-chapters";

function fakeDb(queuedRows: unknown[][]) {
  const query = vi.fn();
  for (const rows of queuedRows) {
    query.mockResolvedValueOnce({ rows });
  }
  return { query };
}

describe("listChapterIdsForUser", () => {
  it("returns just the chapter ids", async () => {
    const db = fakeDb([[{ chapter_id: "c-1" }, { chapter_id: "c-2" }]]);
    expect(await listChapterIdsForUser(db, "u-1")).toEqual(["c-1", "c-2"]);
  });
});

describe("listMembershipsForUser", () => {
  it("maps rows to chapterId/role", async () => {
    const db = fakeDb([[{ chapter_id: "c-1", role: "head" }]]);
    expect(await listMembershipsForUser(db, "u-1")).toEqual([
      { chapterId: "c-1", role: "head" },
    ]);
  });
});

describe("listMembershipsForUsers", () => {
  it("returns an empty map without querying for no ids", async () => {
    const db = fakeDb([]);
    const result = await listMembershipsForUsers(db, []);
    expect(result.size).toBe(0);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("groups memberships by profile_id", async () => {
    const db = fakeDb([
      [
        { profile_id: "u-1", chapter_id: "c-1", role: "head" },
        { profile_id: "u-1", chapter_id: "c-2", role: "member" },
        { profile_id: "u-2", chapter_id: "c-1", role: "member" },
      ],
    ]);

    const result = await listMembershipsForUsers(db, ["u-1", "u-2"]);

    expect(result.get("u-1")).toEqual([
      { chapterId: "c-1", role: "head" },
      { chapterId: "c-2", role: "member" },
    ]);
    expect(result.get("u-2")).toEqual([{ chapterId: "c-1", role: "member" }]);
  });
});

describe("listMembersOfChapter", () => {
  it("maps rows to profileId/role", async () => {
    const db = fakeDb([[{ profile_id: "u-1", role: "member" }]]);
    expect(await listMembersOfChapter(db, "c-1")).toEqual([
      { profileId: "u-1", role: "member" },
    ]);
  });
});

describe("replaceMembershipsForUser", () => {
  it("deletes existing rows and skips the insert when given no memberships", async () => {
    const db = fakeDb([[]]);
    await replaceMembershipsForUser(db, "u-1", []);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledWith(
      `DELETE FROM profile_chapters WHERE profile_id = $1`,
      ["u-1"],
    );
  });

  it("deletes then bulk-inserts with correct positional placeholders", async () => {
    const db = fakeDb([[], []]);
    await replaceMembershipsForUser(db, "u-1", [
      { chapterId: "c-1", role: "head" },
      { chapterId: "c-2", role: "member" },
    ]);

    expect(db.query).toHaveBeenCalledTimes(2);
    const [insertSql, insertValues] = db.query.mock.calls[1];
    expect(insertSql).toContain("($1, $2, $3), ($1, $4, $5)");
    expect(insertValues).toEqual(["u-1", "c-1", "head", "c-2", "member"]);
  });
});
