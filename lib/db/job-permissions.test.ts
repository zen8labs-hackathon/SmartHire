import { describe, expect, it, vi } from "vitest";

import {
  createEvaluateTemplate,
  deleteEvaluateTemplateById,
  deleteJobEvaluateTemplate,
  getEvaluateTemplateById,
  getEvaluateTemplateByIdForRead,
  getJobEvaluateTemplate,
  grantJobToChapter,
  grantJobToProfile,
  listAllowedChaptersForJob,
  listAllowedProfilesForJob,
  listEvaluateTemplates,
  replaceAllowedChaptersForJob,
  replaceAllowedProfilesForJob,
  revokeJobFromChapter,
  revokeJobFromProfile,
  updateEvaluateTemplate,
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
      expect.stringContaining("ON CONFLICT (job_id) WHERE job_id IS NOT NULL DO UPDATE SET"),
      ["job-1", "templates/a.pdf", null, null, null, null, null],
    );
  });

  it("upsertJobEvaluateTemplate saves plain text and clears file fields", async () => {
    const row = { id: "1", job_id: "job-1", content_text: "Min 4 years experience" };
    const db = fakeDb([row]);

    const result = await upsertJobEvaluateTemplate(db, {
      jobId: "job-1",
      contentText: "Min 4 years experience",
      storagePath: null,
      originalFilename: null,
      mimeType: null,
    });

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT (job_id) WHERE job_id IS NOT NULL DO UPDATE SET"),
      ["job-1", null, null, null, "Min 4 years experience", null, null],
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

describe("evaluation template library (job_id IS NULL)", () => {
  it("createEvaluateTemplate inserts with job_id NULL", async () => {
    const row = { id: "1", job_id: null, title: "React rubric" };
    const db = fakeDb([row]);

    const result = await createEvaluateTemplate(db, {
      title: "React rubric",
      contentText: "Rate coding 1-5",
      createdBy: "user-1",
    });

    expect(result).toEqual(row);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("VALUES (NULL, $1, $2, $3, $4, $5, $6, $6)");
    expect(values).toEqual([
      "React rubric",
      null,
      null,
      null,
      "Rate coding 1-5",
      "user-1",
    ]);
  });

  it("listEvaluateTemplates scopes to the creator, job_id IS NULL, and excludes empty rows", async () => {
    const rows = [
      { id: "1", job_id: null, title: "React rubric", content_text: "..." },
    ];
    const db = fakeDb(rows);
    const result = await listEvaluateTemplates(db, "user-1");

    expect(result).toEqual(rows);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("job_id IS NULL");
    expect(sql).toContain("(t.storage_path IS NOT NULL OR t.content_text IS NOT NULL)");
    expect(sql).toContain("($1::uuid IS NULL OR t.created_by = $1)");
    expect(sql).toContain("ORDER BY t.updated_at DESC");
    expect(values).toEqual(["user-1"]);
  });

  it("listEvaluateTemplates with createdBy null lists every entry (HR/admin)", async () => {
    const rows = [{ id: "1", job_id: null, title: "React rubric" }];
    const db = fakeDb(rows);
    const result = await listEvaluateTemplates(db, null);

    expect(result).toEqual(rows);
    const [, values] = db.query.mock.calls[0];
    expect(values).toEqual([null]);
  });

  it("getEvaluateTemplateById scopes by id, created_by, and job_id IS NULL", async () => {
    const row = { id: "1", job_id: null, title: "React rubric" };
    const db = fakeDb([row]);
    const result = await getEvaluateTemplateById(db, "1", "user-1");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id = $1 AND created_by = $2 AND job_id IS NULL"),
      ["1", "user-1"],
    );
  });

  it("getEvaluateTemplateByIdForRead scopes by id and job_id IS NULL only, no owner check", async () => {
    const row = { id: "1", job_id: null, title: "React rubric" };
    const db = fakeDb([row]);
    const result = await getEvaluateTemplateByIdForRead(db, "1");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id = $1 AND job_id IS NULL"),
      ["1"],
    );
  });

  it("updateEvaluateTemplate updates only the given fields, scoped to the owner", async () => {
    const row = { id: "1", job_id: null, title: "New title" };
    const db = fakeDb([row]);
    const result = await updateEvaluateTemplate(db, "1", "user-1", { title: "New title" }, "user-1");

    expect(result).toEqual(row);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("SET title = $4, updated_by = $3, updated_at = now()");
    expect(sql).toContain("WHERE id = $1 AND created_by = $2 AND job_id IS NULL");
    expect(values).toEqual(["1", "user-1", "user-1", "New title"]);
  });

  it("updateEvaluateTemplate with no fields falls back to a plain fetch", async () => {
    const row = { id: "1", job_id: null, title: "React rubric" };
    const db = fakeDb([row]);
    const result = await updateEvaluateTemplate(db, "1", "user-1", {}, "user-1");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id = $1 AND created_by = $2 AND job_id IS NULL"),
      ["1", "user-1"],
    );
  });

  it("deleteEvaluateTemplateById deletes scoped to the owner and job_id IS NULL", async () => {
    const row = { id: "1", job_id: null };
    const db = fakeDb([row]);
    const result = await deleteEvaluateTemplateById(db, "1", "user-1");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id = $1 AND created_by = $2 AND job_id IS NULL"),
      ["1", "user-1"],
    );
  });
});
