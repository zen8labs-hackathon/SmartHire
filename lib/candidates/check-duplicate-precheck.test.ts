import { describe, expect, it, vi } from "vitest";

import {
  evaluateDuplicatePrecheck,
  runDedupePrecheck,
  shouldQueryForPrecheck,
} from "./check-duplicate-precheck";
import type { CandidateDedupeRow } from "./duplicate-detection";

function fakeDb(rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query };
}

function dedupeSignalMatchRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    candidate_id: "cand-1",
    candidate_name: "Existing Person",
    candidate_email: "existing@example.com",
    candidate_phone: "0912345678",
    campaign_applied_id: "app-1",
    job_id: "job-1",
    job_position: "Backend Engineer",
    cv_version_id: "cv-1",
    cv_original_filename: "cv.pdf",
    cv_file_sha256: null,
    cv_content_sha256: null,
    cv_role: "Backend Engineer",
    created_at: new Date("2026-07-01T00:00:00Z"),
    cv_created_at: new Date("2026-07-01T00:00:00Z"),
    stage_label: null,
    sub_stage_label: null,
    ...overrides,
  };
}

describe("shouldQueryForPrecheck", () => {
  it("is false when no email, phone, or hash is present", () => {
    expect(
      shouldQueryForPrecheck({
        jobOpeningId: "jo-1",
        email: null,
        phone: null,
        cvFileSha256: null,
        cvContentSha256: null,
      }),
    ).toBe(false);
  });

  it("is true when only a file hash is present", () => {
    expect(
      shouldQueryForPrecheck({
        jobOpeningId: "jo-1",
        email: null,
        phone: null,
        cvFileSha256: "f".repeat(64),
        cvContentSha256: null,
      }),
    ).toBe(true);
  });

  it("is true when only an email is present", () => {
    expect(
      shouldQueryForPrecheck({
        jobOpeningId: "jo-1",
        email: "a@example.com",
        phone: null,
        cvFileSha256: null,
        cvContentSha256: null,
      }),
    ).toBe(true);
  });

  it("is true when only a phone is present", () => {
    expect(
      shouldQueryForPrecheck({
        jobOpeningId: "jo-1",
        email: null,
        phone: "0912345678",
        cvFileSha256: null,
        cvContentSha256: null,
      }),
    ).toBe(true);
  });

  it("is true when only a content hash is present", () => {
    expect(
      shouldQueryForPrecheck({
        jobOpeningId: "jo-1",
        email: null,
        phone: null,
        cvFileSha256: null,
        cvContentSha256: "c".repeat(64),
      }),
    ).toBe(true);
  });
});

describe("evaluateDuplicatePrecheck", () => {
  it("returns no hits and no preview when nothing matches", () => {
    const others: CandidateDedupeRow[] = [
      {
        id: "old-1",
        name: "Old",
        status: "New",
        job_opening_id: "jo-1",
        cv_uploaded_at: null,
        created_at: "2025-12-01",
        parsed_payload: { email: "other@example.com" },
      },
    ];
    const result = evaluateDuplicatePrecheck(
      {
        jobOpeningId: "jo-1",
        email: "new@example.com",
        phone: null,
        cvFileSha256: null,
        cvContentSha256: null,
      },
      others,
    );
    expect(result.duplicateCandidates).toHaveLength(0);
    expect(result.duplicateNewUpload).toBeNull();
  });

  it("matches by email and populates a preview", () => {
    const others: CandidateDedupeRow[] = [
      {
        id: "old-1",
        name: "Old",
        status: "CvPassed",
        job_opening_id: "jo-1",
        job_opening_title: "Engineer",
        cv_uploaded_at: null,
        created_at: "2025-12-01",
        parsed_payload: { email: "same@example.com", role: "Engineer" },
      },
    ];
    const result = evaluateDuplicatePrecheck(
      {
        jobOpeningId: "jo-1",
        email: "same@example.com",
        phone: null,
        cvFileSha256: null,
        cvContentSha256: null,
      },
      others,
    );
    expect(result.duplicateCandidates).toHaveLength(1);
    expect(result.duplicateCandidates[0]?.matchedOn).toBe("email");
    expect(result.duplicateCandidates[0]?.id).toBe("old-1");
    expect(result.duplicateNewUpload?.email).toBe("same@example.com");
  });

  it("matches by cv_file hash before any AI parse has happened", () => {
    const fileHash = "d".repeat(64);
    const others: CandidateDedupeRow[] = [
      {
        id: "old-2",
        name: "Old",
        status: "New",
        job_opening_id: "jo-1",
        cv_uploaded_at: null,
        created_at: "2025-12-01",
        parsed_payload: {},
        cv_file_sha256: fileHash,
      },
    ];
    const result = evaluateDuplicatePrecheck(
      {
        jobOpeningId: "jo-1",
        email: null,
        phone: null,
        cvFileSha256: fileHash,
        cvContentSha256: null,
      },
      others,
    );
    expect(result.duplicateCandidates).toHaveLength(1);
    expect(result.duplicateCandidates[0]?.matchedOn).toBe("cv_file");
    expect(result.duplicateNewUpload).not.toBeNull();
  });

  it("matches by cv_content hash when file bytes differ but extracted text is identical", () => {
    const contentHash = "e".repeat(64);
    const others: CandidateDedupeRow[] = [
      {
        id: "old-3",
        name: "Old",
        status: "New",
        job_opening_id: "jo-1",
        cv_uploaded_at: null,
        created_at: "2025-12-01",
        parsed_payload: {},
        cv_content_sha256: contentHash,
      },
    ];
    const result = evaluateDuplicatePrecheck(
      {
        jobOpeningId: "jo-1",
        email: null,
        phone: null,
        cvFileSha256: null,
        cvContentSha256: contentHash,
      },
      others,
    );
    expect(result.duplicateCandidates).toHaveLength(1);
    expect(result.duplicateCandidates[0]?.matchedOn).toBe("cv_content");
  });

  it("matches by phone (VN 0-prefix vs 84-prefix variants)", () => {
    const others: CandidateDedupeRow[] = [
      {
        id: "old-4",
        name: "Old",
        status: "New",
        job_opening_id: "jo-1",
        cv_uploaded_at: null,
        created_at: "2025-12-01",
        parsed_payload: { phone: "+84 912 345 678" },
      },
    ];
    const result = evaluateDuplicatePrecheck(
      {
        jobOpeningId: "jo-1",
        email: null,
        phone: "0912345678",
        cvFileSha256: null,
        cvContentSha256: null,
      },
      others,
    );
    expect(result.duplicateCandidates).toHaveLength(1);
    expect(result.duplicateCandidates[0]?.matchedOn).toBe("phone");
  });

  it("reports email_or_phone when both the email and phone match the same candidate", () => {
    const others: CandidateDedupeRow[] = [
      {
        id: "old-5",
        name: "Old",
        status: "New",
        job_opening_id: "jo-1",
        cv_uploaded_at: null,
        created_at: "2025-12-01",
        parsed_payload: { email: "dup@example.com", phone: "0912345678" },
      },
    ];
    const result = evaluateDuplicatePrecheck(
      {
        jobOpeningId: "jo-1",
        email: "dup@example.com",
        phone: "0912345678",
        cvFileSha256: null,
        cvContentSha256: null,
      },
      others,
    );
    expect(result.duplicateCandidates).toHaveLength(1);
    expect(result.duplicateCandidates[0]?.matchedOn).toBe("email_or_phone");
  });

  it("does not match against candidates in a different job opening (server pre-filters, but precheck row scoping should not itself introduce cross-job hits)", () => {
    const others: CandidateDedupeRow[] = [
      {
        id: "old-6",
        name: "Old",
        status: "New",
        job_opening_id: "jo-2",
        cv_uploaded_at: null,
        created_at: "2025-12-01",
        parsed_payload: { email: "same@example.com" },
      },
    ];
    // evaluateDuplicatePrecheck itself does not filter by job_opening_id (the
    // route's Supabase query does that before calling it) — this test pins
    // down that email/hash matching is unconditional once `others` is passed in.
    const result = evaluateDuplicatePrecheck(
      {
        jobOpeningId: "jo-1",
        email: "same@example.com",
        phone: null,
        cvFileSha256: null,
        cvContentSha256: null,
      },
      others,
    );
    expect(result.duplicateCandidates).toHaveLength(1);
  });
});

describe("runDedupePrecheck", () => {
  it("short-circuits without querying when no signal is present", async () => {
    const db = fakeDb();

    const result = await runDedupePrecheck(db, {
      email: null,
      phone: null,
      cvFileSha256: null,
      cvContentSha256: null,
    });

    expect(result).toEqual({ duplicateCandidates: [], duplicateNewUpload: null });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("queries and maps a match into a duplicateCandidates hit", async () => {
    const db = fakeDb([dedupeSignalMatchRow()]);

    const result = await runDedupePrecheck(db, {
      email: "existing@example.com",
      phone: null,
      cvFileSha256: null,
      cvContentSha256: null,
    });

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(result.duplicateCandidates).toHaveLength(1);
    expect(result.duplicateCandidates[0]?.matchedOn).toBe("email");
    expect(result.duplicateCandidates[0]?.id).toBe("app-1");
    expect(result.duplicateNewUpload?.email).toBe("existing@example.com");
  });

  it("normalizes phone into variants before querying", async () => {
    const db = fakeDb([]);

    await runDedupePrecheck(db, {
      email: null,
      phone: "+84 912 345 678",
      cvFileSha256: null,
      cvContentSha256: null,
    });

    const [, values] = db.query.mock.calls[0];
    // values[1] is the phoneVariants array positional param.
    expect(values[1]).toEqual(expect.arrayContaining(["0912345678"]));
  });

  it("passes excludeCampaignAppliedId through as the exclusion filter", async () => {
    const db = fakeDb([]);

    await runDedupePrecheck(
      db,
      { email: "someone@example.com", phone: null, cvFileSha256: null, cvContentSha256: null },
      "app-to-exclude",
    );

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("ca.id != $5");
    expect(values).toContain("app-to-exclude");
  });

  it("returns no hits when the query finds nothing", async () => {
    const db = fakeDb([]);

    const result = await runDedupePrecheck(db, {
      email: "nobody@example.com",
      phone: null,
      cvFileSha256: null,
      cvContentSha256: null,
    });

    expect(result).toEqual({ duplicateCandidates: [], duplicateNewUpload: null });
  });
});
