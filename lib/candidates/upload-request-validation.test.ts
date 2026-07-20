import { describe, expect, it, vi } from "vitest";

import { validateCvUploadRequest } from "@/lib/candidates/upload-request-validation";

function fakeDb(rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query };
}

const VALID_JOB_ID = "019f5fc9-d59a-7286-b541-06beae665ed2";

const baseBody = {
  filename: "resume.pdf",
  mimeType: "application/pdf",
  jobId: VALID_JOB_ID,
  source: "LinkedIn",
  sourceOther: null,
  expectedSalary: null,
};

describe("validateCvUploadRequest", () => {
  it("rejects a missing filename", async () => {
    const db = fakeDb([{ id: VALID_JOB_ID }]);
    const result = await validateCvUploadRequest(db, { ...baseBody, filename: "" });
    expect(result).toEqual({
      ok: false,
      error: "Only .pdf and .docx files are allowed.",
      status: 400,
    });
  });

  it("rejects a disallowed extension", async () => {
    const db = fakeDb([{ id: VALID_JOB_ID }]);
    const result = await validateCvUploadRequest(db, { ...baseBody, filename: "resume.exe" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Only .pdf and .docx files are allowed.");
  });

  it("rejects a missing jobId", async () => {
    const db = fakeDb();
    const result = await validateCvUploadRequest(db, { ...baseBody, jobId: null });
    expect(result).toEqual({
      ok: false,
      error: "Select a target campaign before uploading.",
      status: 400,
    });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID jobId", async () => {
    const db = fakeDb();
    const result = await validateCvUploadRequest(db, { ...baseBody, jobId: "not-a-uuid" });
    expect(result).toEqual({ ok: false, error: "Invalid job id.", status: 400 });
  });

  it("rejects an invalid source", async () => {
    const db = fakeDb([{ id: VALID_JOB_ID }]);
    const result = await validateCvUploadRequest(db, { ...baseBody, source: "Craigslist" });
    expect(result).toEqual({
      ok: false,
      error: "Select a valid candidate source.",
      status: 400,
    });
  });

  it("requires sourceOther when source is Other", async () => {
    const db = fakeDb([{ id: VALID_JOB_ID }]);
    const result = await validateCvUploadRequest(db, {
      ...baseBody,
      source: "Other",
      sourceOther: "  ",
    });
    expect(result).toEqual({
      ok: false,
      error: "Please describe the source when you select Other.",
      status: 400,
    });
  });

  it("rejects a sourceOther longer than 500 characters", async () => {
    const db = fakeDb([{ id: VALID_JOB_ID }]);
    const result = await validateCvUploadRequest(db, {
      ...baseBody,
      source: "Other",
      sourceOther: "x".repeat(501),
    });
    expect(result).toEqual({
      ok: false,
      error: "Source description must be at most 500 characters.",
      status: 400,
    });
  });

  it("rejects an expectedSalary longer than 200 characters", async () => {
    const db = fakeDb([{ id: VALID_JOB_ID }]);
    const result = await validateCvUploadRequest(db, {
      ...baseBody,
      expectedSalary: "x".repeat(201),
    });
    expect(result).toEqual({
      ok: false,
      error: "Expected salary must be at most 200 characters.",
      status: 400,
    });
  });

  it("rejects when the job does not exist", async () => {
    const db = fakeDb([]);
    const result = await validateCvUploadRequest(db, baseBody);
    expect(result).toEqual({ ok: false, error: "Job not found.", status: 400 });
  });

  it("returns the validated, normalized fields on success", async () => {
    const db = fakeDb([{ id: VALID_JOB_ID }]);
    const result = await validateCvUploadRequest(db, {
      ...baseBody,
      filename: "  Nguyen Van A - CV.pdf  ",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      filename: "Nguyen Van A - CV.pdf",
      ext: ".pdf",
      baseName: "Nguyen Van A - CV",
      jobId: VALID_JOB_ID,
      source: "LinkedIn",
      sourceOther: null,
      expectedSalary: null,
      mimeType: "application/pdf",
    });
  });

  it("trims and keeps sourceOther/expectedSalary when Other + a value are provided", async () => {
    const db = fakeDb([{ id: VALID_JOB_ID }]);
    const result = await validateCvUploadRequest(db, {
      ...baseBody,
      source: "Other",
      sourceOther: "  Referral from a friend  ",
      expectedSalary: "  20 triệu  ",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sourceOther).toBe("Referral from a friend");
    expect(result.value.expectedSalary).toBe("20 triệu");
  });
});
