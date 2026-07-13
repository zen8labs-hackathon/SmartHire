import { describe, expect, it, vi } from "vitest";

import {
  assertChapterIdsExist,
  fetchViewerChapterIdsForJobDescription,
  fetchViewerEmailsForJobDescription,
  parseViewerChapterIds,
  parseViewerEmailInput,
  replaceJobDescriptionViewerChapters,
  replaceJobDescriptionViewers,
  resolveViewerEmailsToUserIds,
  syncJobDescriptionViewersFromEmails,
} from "@/lib/admin/jd-viewer-sync";

function fakeDb(queuedRows: unknown[][]) {
  const query = vi.fn();
  for (const rows of queuedRows) {
    query.mockResolvedValueOnce({ rows });
  }
  return { query };
}

describe("parseViewerEmailInput", () => {
  it("splits on whitespace/comma/semicolon, normalizes, dedupes, drops invalid", () => {
    const result = parseViewerEmailInput("A@B.com, a@b.com; c@d.com not-an-email");
    expect(result).toEqual(["a@b.com", "c@d.com"]);
  });

  it("accepts a string array", () => {
    expect(parseViewerEmailInput(["a@b.com", "c@d.com"])).toEqual([
      "a@b.com",
      "c@d.com",
    ]);
  });

  it("returns [] for null/undefined", () => {
    expect(parseViewerEmailInput(null)).toEqual([]);
    expect(parseViewerEmailInput(undefined)).toEqual([]);
  });
});

describe("parseViewerChapterIds", () => {
  it("keeps only valid UUIDs and dedupes", () => {
    const id = "11111111-1111-1111-8111-111111111111";
    expect(parseViewerChapterIds([id, id, "not-a-uuid"])).toEqual([id]);
  });

  it("accepts a single string", () => {
    const id = "11111111-1111-1111-8111-111111111111";
    expect(parseViewerChapterIds(id)).toEqual([id]);
  });
});

describe("resolveViewerEmailsToUserIds", () => {
  it("returns empty results without querying for an empty email list", async () => {
    const db = fakeDb([]);
    const result = await resolveViewerEmailsToUserIds(db, []);
    expect(result).toEqual({ idByEmail: new Map(), notFound: [] });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("maps found emails to ids and reports the rest as notFound", async () => {
    const db = fakeDb([[{ id: "u-1", email: "a@b.com" }]]);
    const result = await resolveViewerEmailsToUserIds(db, ["a@b.com", "missing@x.com"]);
    expect(result.idByEmail.get("a@b.com")).toBe("u-1");
    expect(result.notFound).toEqual(["missing@x.com"]);
  });
});

describe("fetchViewerEmailsForJobDescription", () => {
  it("returns [] without a users lookup when no grants exist", async () => {
    const db = fakeDb([[]]);
    const result = await fetchViewerEmailsForJobDescription(db, "job-1");
    expect(result).toEqual([]);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("resolves granted profile ids to sorted emails", async () => {
    const db = fakeDb([
      [{ job_id: "job-1", profile_id: "u-1" }, { job_id: "job-1", profile_id: "u-2" }],
      [{ id: "u-2", email: "b@b.com" }, { id: "u-1", email: "a@a.com" }],
    ]);
    const result = await fetchViewerEmailsForJobDescription(db, "job-1");
    expect(result).toEqual(["a@a.com", "b@b.com"]);
  });
});

describe("fetchViewerChapterIdsForJobDescription", () => {
  it("returns sorted chapter ids", async () => {
    const db = fakeDb([
      [{ job_id: "job-1", chapter_id: "c2" }, { job_id: "job-1", chapter_id: "c1" }],
    ]);
    const result = await fetchViewerChapterIdsForJobDescription(db, "job-1");
    expect(result).toEqual(["c1", "c2"]);
  });
});

describe("assertChapterIdsExist", () => {
  it("is ok without querying when given no ids", async () => {
    const db = fakeDb([]);
    const result = await assertChapterIdsExist(db, []);
    expect(result).toEqual({ ok: true });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("reports unknown ids", async () => {
    const db = fakeDb([[{ id: "c1" }]]);
    const result = await assertChapterIdsExist(db, ["c1", "c2"]);
    expect(result).toEqual({ ok: false, unknownIds: ["c2"] });
  });
});

describe("syncJobDescriptionViewersFromEmails", () => {
  it("clears all viewers when emails is empty", async () => {
    const db = fakeDb([[]]);
    const result = await syncJobDescriptionViewersFromEmails(db, {
      jobId: "job-1",
      emails: [],
      grantedBy: "admin-1",
    });
    expect(result).toEqual({ notFound: [] });
    expect(db.query).toHaveBeenCalledWith(
      `DELETE FROM job_allowed_profiles WHERE job_id = $1`,
      ["job-1"],
    );
  });

  it("returns notFound without mutating when an email doesn't resolve", async () => {
    const db = fakeDb([[{ id: "u-1", email: "a@b.com" }]]);
    const result = await syncJobDescriptionViewersFromEmails(db, {
      jobId: "job-1",
      emails: ["a@b.com", "missing@x.com"],
      grantedBy: "admin-1",
    });
    expect(result).toEqual({ notFound: ["missing@x.com"] });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("replaces grants with resolved user ids", async () => {
    const db = fakeDb([[{ id: "u-1", email: "a@b.com" }], [], []]);
    const result = await syncJobDescriptionViewersFromEmails(db, {
      jobId: "job-1",
      emails: ["a@b.com"],
      grantedBy: "admin-1",
    });
    expect(result).toEqual({ notFound: [] });
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      `DELETE FROM job_allowed_profiles WHERE job_id = $1`,
      ["job-1"],
    );
  });
});

describe("replaceJobDescriptionViewers", () => {
  it("delegates to replaceAllowedProfilesForJob", async () => {
    const db = fakeDb([[]]);
    await replaceJobDescriptionViewers(db, {
      jobId: "job-1",
      userIds: ["u-1"],
      grantedBy: "admin-1",
    });
    expect(db.query).toHaveBeenCalledWith(
      `DELETE FROM job_allowed_profiles WHERE job_id = $1`,
      ["job-1"],
    );
  });
});

describe("replaceJobDescriptionViewerChapters", () => {
  it("delegates to replaceAllowedChaptersForJob", async () => {
    const db = fakeDb([[]]);
    await replaceJobDescriptionViewerChapters(db, {
      jobId: "job-1",
      chapterIds: ["c1"],
      grantedBy: "admin-1",
    });
    expect(db.query).toHaveBeenCalledWith(
      `DELETE FROM job_allowed_chapters WHERE job_id = $1`,
      ["job-1"],
    );
  });
});
