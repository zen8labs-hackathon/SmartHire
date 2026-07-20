import { describe, expect, it, vi } from "vitest";

import { isChapterHeadOnJob } from "@/lib/admin/profile-access";

function fakeDb(queuedRows: unknown[][]) {
  const query = vi.fn();
  for (const rows of queuedRows) {
    query.mockResolvedValueOnce({ rows });
  }
  return { query };
}

describe("isChapterHeadOnJob", () => {
  it("returns true when the chapter-head ACL query finds a row", async () => {
    const db = fakeDb([[{ ok: 1 }]]);

    const result = await isChapterHeadOnJob(db, "user-1", "job-1");

    expect(result).toBe(true);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("pc.role = 'head'"),
      ["job-1", "user-1"],
    );
  });

  it("returns false when the user is not a head on any granted chapter", async () => {
    const db = fakeDb([[]]);

    const result = await isChapterHeadOnJob(db, "user-1", "job-1");

    expect(result).toBe(false);
  });
});
