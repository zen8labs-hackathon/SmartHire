import { describe, expect, it } from "vitest";

import {
  isMissingCvDetailVersionColumn,
  isMissingCvVersionEventsTable,
} from "./cv-versioning-schema-guard";

describe("cv-versioning-schema-guard", () => {
  it("detects missing cv_detail_version column by message", () => {
    expect(
      isMissingCvDetailVersionColumn({
        message: 'column "cv_detail_version" does not exist',
      }),
    ).toBe(true);
    expect(
      isMissingCvDetailVersionColumn({
        message: "column candidates.cv_detail_version does not exist",
      }),
    ).toBe(true);
  });

  it("detects missing cv_detail_version column by PG code", () => {
    expect(
      isMissingCvDetailVersionColumn({
        code: "42703",
        message: "column cv_detail_version of relation candidates does not exist",
      }),
    ).toBe(true);
  });

  it("detects missing events table by message", () => {
    expect(
      isMissingCvVersionEventsTable({
        message:
          'relation "public.candidate_cv_detail_version_events" does not exist',
      }),
    ).toBe(true);
  });

  it("detects missing events table by PG code", () => {
    expect(
      isMissingCvVersionEventsTable({
        code: "42P01",
        message: 'relation "candidate_cv_detail_version_events" does not exist',
      }),
    ).toBe(true);
  });

  it("does not false-positive on unrelated errors", () => {
    expect(
      isMissingCvDetailVersionColumn({ message: "connection refused" }),
    ).toBe(false);
    expect(
      isMissingCvVersionEventsTable({ message: "permission denied" }),
    ).toBe(false);
  });
});
