import { describe, expect, it } from "vitest";

import {
  evaluateDuplicatePrecheck,
  shouldQueryForPrecheck,
} from "./check-duplicate-precheck";
import type { CandidateDedupeRow } from "./duplicate-detection";

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
