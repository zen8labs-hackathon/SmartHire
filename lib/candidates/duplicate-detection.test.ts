import { describe, expect, it } from "vitest";

import {
  findDuplicateCandidateHits,
  hasPhoneMatch,
  normalizeEmailFromPayload,
  normalizePhoneFromPayload,
  parsedContactFromPayload,
  shouldFetchCandidatesForDedupe,
} from "./duplicate-detection";

describe("normalizeEmailFromPayload", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmailFromPayload("  User@Example.COM ")).toBe(
      "user@example.com",
    );
  });

  it("extracts email from surrounding text", () => {
    expect(normalizeEmailFromPayload("reach me user@example.com thanks")).toBe(
      "user@example.com",
    );
  });

  it("returns null for empty", () => {
    expect(normalizeEmailFromPayload("   ")).toBeNull();
    expect(normalizeEmailFromPayload(null)).toBeNull();
  });
});

describe("normalizePhoneFromPayload", () => {
  it("produces matching variants for VN +84 vs 0", () => {
    const a = normalizePhoneFromPayload("+84 912 345 678");
    const b = normalizePhoneFromPayload("0912345678");
    expect(a.phone).toBeTruthy();
    expect(b.phone).toBeTruthy();
    const ca = parsedContactFromPayload({ phone: "+84 912 345 678" });
    const cb = parsedContactFromPayload({ phone: "0912345678" });
    expect(hasPhoneMatch(ca, cb)).toBe(true);
  });
});

describe("shouldFetchCandidatesForDedupe", () => {
  it("is true when content hash only", () => {
    expect(
      shouldFetchCandidatesForDedupe({
        id: "1",
        name: null,
        status: null,
        job_opening_id: null,
        cv_uploaded_at: null,
        created_at: null,
        parsed_payload: {},
        cv_content_sha256: "a".repeat(64),
      }),
    ).toBe(true);
  });

  it("is true when file hash only", () => {
    expect(
      shouldFetchCandidatesForDedupe({
        id: "1",
        name: null,
        status: null,
        job_opening_id: null,
        cv_uploaded_at: null,
        created_at: null,
        parsed_payload: {},
        cv_file_sha256: "f".repeat(64),
      }),
    ).toBe(true);
  });

  it("is false when no contact and no hash", () => {
    expect(
      shouldFetchCandidatesForDedupe({
        id: "1",
        name: null,
        status: null,
        job_opening_id: null,
        cv_uploaded_at: null,
        created_at: null,
        parsed_payload: {},
      }),
    ).toBe(false);
  });
});

describe("findDuplicateCandidateHits", () => {
  const baseCurrent = {
    id: "new-1",
    name: "A",
    status: "New",
    job_opening_id: null,
    cv_uploaded_at: null,
    created_at: "2026-01-01",
    parsed_payload: { email: "same@example.com", phone: null },
  };

  it("matches email", () => {
    const hits = findDuplicateCandidateHits(baseCurrent, [
      {
        id: "old-1",
        name: "Old",
        status: "CvPassed",
        job_opening_id: "jo",
        cv_uploaded_at: null,
        created_at: "2025-12-01",
        parsed_payload: {
          email: "same@example.com",
          role: "  UX Designer ",
        },
      },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.matchedOn).toBe("email");
    expect(hits[0]?.id).toBe("old-1");
    expect(hits[0]?.email).toBe("same@example.com");
    expect(hits[0]?.parsedRole).toBe("UX Designer");
  });

  it("populates jobOpeningTitle when present", () => {
    const hits = findDuplicateCandidateHits(baseCurrent, [
      {
        id: "old-1",
        name: "Old",
        status: "CvPassed",
        job_opening_id: "jo",
        job_opening_title: "Staff Software Engineer",
        cv_uploaded_at: null,
        created_at: "2025-12-01",
        parsed_payload: {
          email: "same@example.com",
        },
      },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.jobOpeningTitle).toBe("Staff Software Engineer");
  });

  it("matches cv_content when hashes equal", () => {
    const hash = "b".repeat(64);
    const hits = findDuplicateCandidateHits(
      {
        ...baseCurrent,
        parsed_payload: {},
        cv_content_sha256: hash,
      },
      [
        {
          id: "old-2",
          name: "Other",
          status: "New",
          job_opening_id: null,
          cv_uploaded_at: null,
          created_at: "2025-12-01",
          parsed_payload: { email: "other@example.com" },
          cv_content_sha256: hash,
        },
      ],
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.matchedOn).toBe("cv_content");
  });

  it("prefers email over cv_content when both match", () => {
    const hash = "c".repeat(64);
    const hits = findDuplicateCandidateHits(
      {
        ...baseCurrent,
        parsed_payload: { email: "same@example.com" },
        cv_content_sha256: hash,
      },
      [
        {
          id: "old-3",
          name: "X",
          status: "New",
          job_opening_id: null,
          cv_uploaded_at: null,
          created_at: "2025-12-01",
          parsed_payload: { email: "same@example.com" },
          cv_content_sha256: hash,
        },
      ],
    );
    expect(hits[0]?.matchedOn).toBe("email");
  });

  it("matches cv_file when file hashes equal", () => {
    const fileHash = "d".repeat(64);
    const hits = findDuplicateCandidateHits(
      {
        ...baseCurrent,
        parsed_payload: {},
        cv_file_sha256: fileHash,
      },
      [
        {
          id: "old-4",
          name: "DupFile",
          status: "New",
          job_opening_id: null,
          cv_uploaded_at: null,
          created_at: "2025-12-01",
          parsed_payload: { email: "x@y.com" },
          cv_file_sha256: fileHash,
        },
      ],
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.matchedOn).toBe("cv_file");
  });

  it("prefers cv_file over cv_content when both match and no email/phone", () => {
    const fileHash = "e".repeat(64);
    const contentHash = "g".repeat(64);
    const hits = findDuplicateCandidateHits(
      {
        id: "new-2",
        name: "B",
        status: "New",
        job_opening_id: null,
        cv_uploaded_at: null,
        created_at: "2026-01-02",
        parsed_payload: {},
        cv_file_sha256: fileHash,
        cv_content_sha256: contentHash,
      },
      [
        {
          id: "old-5",
          name: "Y",
          status: "New",
          job_opening_id: null,
          cv_uploaded_at: null,
          created_at: "2025-12-01",
          parsed_payload: {},
          cv_file_sha256: fileHash,
          cv_content_sha256: contentHash,
        },
      ],
    );
    expect(hits[0]?.matchedOn).toBe("cv_file");
  });

  it("prefers email over cv_file when both match", () => {
    const fileHash = "h".repeat(64);
    const hits = findDuplicateCandidateHits(
      {
        ...baseCurrent,
        parsed_payload: { email: "same@example.com" },
        cv_file_sha256: fileHash,
      },
      [
        {
          id: "old-6",
          name: "Z",
          status: "New",
          job_opening_id: null,
          cv_uploaded_at: null,
          created_at: "2025-12-01",
          parsed_payload: { email: "same@example.com" },
          cv_file_sha256: fileHash,
        },
      ],
    );
    expect(hits[0]?.matchedOn).toBe("email");
  });
});
