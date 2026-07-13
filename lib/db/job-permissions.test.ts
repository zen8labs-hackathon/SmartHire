import { describe, expect, it, vi } from "vitest";

import {
  deleteJobEvaluateTemplate,
  getJobEvaluateTemplate,
  grantJobToChapter,
  grantJobToProfile,
  listAllowedChaptersForJob,
  listAllowedProfilesForJob,
  replaceAllowedChaptersForJob,
  replaceAllowedProfilesForJob,
  revokeJobFromChapter,
  revokeJobFromProfile,
  upsertJobEvaluateTemplate,
} from "@/lib/db/job-permissions";

function fakeDb(rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query };
}

describe("job_allowed_profiles", () => {
  it("listAllowedProfilesForJob selects by job_id", async () => {
    const db = fakeDb([{ job_id: "job-1", profile_id: "p1" }]);
    const result = await listAllowedProfilesForJob(db, "job-1");
    expect(result).toEqual([{ job_id: "job-1", profile_id: "p1" }]);
  });

  it("grantJobToProfile inserts with ON CONFLICT DO NOTHING on the composite PK", async () => {
    const db = fakeDb([]);
    await grantJobToProfile(db, "job-1", "p1", "granter-1");
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT (job_id, profile_id) DO NOTHING"),
      ["job-1", "p1", "granter-1"],
    );
  });

  it("revokeJobFromProfile deletes by composite key", async () => {
    const db = fakeDb([]);
    await revokeJobFromProfile(db, "job-1", "p1");
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM job_allowed_profiles"),
      ["job-1", "p1"],
    );
  });
  it("replaceAllowedProfilesForJob deletes existing then bulk-inserts the new list", async () => {
    const db = fakeDb([]);
    await replaceAllowedProfilesForJob(db, "job-1", ["p1", "p2"], "granter-1");

    expect(db.query).toHaveBeenNthCalledWith(
      1,
      `DELETE FROM job_allowed_profiles WHERE job_id = $1`,
      ["job-1"],
    );
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO job_allowed_profiles"),
      ["job-1", "granter-1", "p1", "p2"],
    );
  });

  it("replaceAllowedProfilesForJob only deletes when the new list is empty", async () => {
    const db = fakeDb([]);
    await replaceAllowedProfilesForJob(db, "job-1", []);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

describe("job_allowed_chapters", () => {
  it("listAllowedChaptersForJob selects by job_id", async () => {
    const db = fakeDb([{ job_id: "job-1", chapter_id: "c1" }]);
    const result = await listAllowedChaptersForJob(db, "job-1");
    expect(result).toEqual([{ job_id: "job-1", chapter_id: "c1" }]);
  });

  it("grantJobToChapter inserts with ON CONFLICT DO NOTHING", async () => {
    const db = fakeDb([]);
    await grantJobToChapter(db, "job-1", "c1");
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT (job_id, chapter_id) DO NOTHING"),
      ["job-1", "c1", null],
    );
  });

  it("revokeJobFromChapter deletes by composite key", async () => {
    const db = fakeDb([]);
    await revokeJobFromChapter(db, "job-1", "c1");
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM job_allowed_chapters"),
      ["job-1", "c1"],
    );
  });
  it("replaceAllowedChaptersForJob deletes existing then bulk-inserts the new list", async () => {
    const db = fakeDb([]);
    await replaceAllowedChaptersForJob(db, "job-1", ["c1", "c2"], "granter-1");

    expect(db.query).toHaveBeenNthCalledWith(
      1,
      `DELETE FROM job_allowed_chapters WHERE job_id = $1`,
      ["job-1"],
    );
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO job_allowed_chapters"),
      ["job-1", "granter-1", "c1", "c2"],
    );
  });
});

describe("job_evaluate_templates", () => {
  it("getJobEvaluateTemplate selects by unique job_id", async () => {
    const row = { id: "1", job_id: "job-1" };
    const db = fakeDb([row]);
    const result = await getJobEvaluateTemplate(db, "job-1");
    expect(result).toEqual(row);
  });

  it("upsertJobEvaluateTemplate uses ON CONFLICT (job_id) DO UPDATE", async () => {
    const row = { id: "1", job_id: "job-1", storage_path: "templates/a.pdf" };
    const db = fakeDb([row]);

    const result = await upsertJobEvaluateTemplate(db, {
      jobId: "job-1",
      storagePath: "templates/a.pdf",
    });

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT (job_id) DO UPDATE SET"),
      ["job-1", "templates/a.pdf", null, null, null, null],
    );
  });

  it("deleteJobEvaluateTemplate deletes by job_id", async () => {
    const db = fakeDb([]);
    await deleteJobEvaluateTemplate(db, "job-1");
    expect(db.query).toHaveBeenCalledWith(
      `DELETE FROM job_evaluate_templates WHERE job_id = $1`,
      ["job-1"],
    );
  });
});
