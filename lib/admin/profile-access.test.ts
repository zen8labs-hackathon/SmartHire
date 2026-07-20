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
  it("returns true when a chapter the user heads is granted access to the job", async () => {
    const db = fakeDb([
      [{ chapter_id: "chapter-a", role: "head" }, { chapter_id: "chapter-b", role: "member" }],
      [{ job_id: "job-1", chapter_id: "chapter-a", granted_by: null, created_at: new Date() }],
    ]);

    const result = await isChapterHeadOnJob(db, "user-1", "job-1");

    expect(result).toBe(true);
  });

  it("returns false when the user's head chapters don't overlap the job's allowed chapters", async () => {
    const db = fakeDb([
      [{ chapter_id: "chapter-a", role: "head" }],
      [{ job_id: "job-1", chapter_id: "chapter-b", granted_by: null, created_at: new Date() }],
    ]);

    const result = await isChapterHeadOnJob(db, "user-1", "job-1");

    expect(result).toBe(false);
  });

  it("returns false when the user is only a member, never a head, of any chapter", async () => {
    const db = fakeDb([
      [{ chapter_id: "chapter-a", role: "member" }],
      [{ job_id: "job-1", chapter_id: "chapter-a", granted_by: null, created_at: new Date() }],
    ]);

    const result = await isChapterHeadOnJob(db, "user-1", "job-1");

    expect(result).toBe(false);
  });

  it("returns false when the user has no chapter memberships at all", async () => {
    const db = fakeDb([[], []]);

    const result = await isChapterHeadOnJob(db, "user-1", "job-1");

    expect(result).toBe(false);
  });
});
