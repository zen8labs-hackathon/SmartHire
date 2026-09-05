import { describe, expect, it, vi } from "vitest";

import {
  insertManyFileUploads,
  listFileUploads,
  updateFileUploadById,
} from "@/lib/db/upload-history";

function fakeDb(rows: unknown[]) {
  const query = vi.fn().mockResolvedValueOnce({ rows });
  return { query };
}

describe("listFileUploads", () => {
  it("filters by jobId when provided", async () => {
    const db = fakeDb([]);

    await listFileUploads(db, { jobId: "job-1" });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("job_id = $1");
    expect(sql).not.toContain("job_id IS NULL");
    expect(params[0]).toBe("job-1");
  });

  it("filters to job-less rows when jobIsNull is set", async () => {
    const db = fakeDb([]);

    await listFileUploads(db, { jobIsNull: true });

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("job_id IS NULL");
  });

  it("ignores jobIsNull when a jobId is also given", async () => {
    const db = fakeDb([]);

    await listFileUploads(db, { jobId: "job-1", jobIsNull: true });

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("job_id = $1");
    expect(sql).not.toContain("job_id IS NULL");
  });
});

describe("insertManyFileUploads", () => {
  it("passes a null job id straight through for pool uploads", async () => {
    const db = fakeDb([{ id: "1" }]);

    await insertManyFileUploads(db, null, "20260101000000", [
      {
        fileName: "a.pdf",
        storageKey: "cv/a.pdf",
        mimeType: "application/pdf",
      },
    ]);

    const [, params] = db.query.mock.calls[0];
    expect(params[1]).toBeNull();
  });

  it("returns early without querying for an empty file list", async () => {
    const db = fakeDb([]);

    const rows = await insertManyFileUploads(db, null, "b", []);

    expect(rows).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe("updateFileUploadById", () => {
  it("can flip a row to completed with its candidate/dedupe/source/recruiter fields, for reusing an existing upload", async () => {
    const db = fakeDb([{ id: "1" }]);

    await updateFileUploadById(db, "1", {
      status: "completed",
      candidateId: "cand-1",
      isExisted: false,
      fileSource: "LinkedIn",
      recruiter: "jane",
    });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("file_source = $");
    expect(sql).toContain("recruiter = $");
    expect(sql).toContain("status = $");
    expect(params).toContain("completed");
    expect(params).toContain("cand-1");
    expect(params).toContain("LinkedIn");
    expect(params).toContain("jane");
  });
});
