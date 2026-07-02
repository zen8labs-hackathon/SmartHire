import { describe, expect, it } from "vitest";
import {
  isEligibleForBulkMoveToInterview,
  isFailSubStageCode,
} from "./pipeline-phase";

describe("isFailSubStageCode", () => {
  it("matches codes containing 'fail' (case-insensitive)", () => {
    expect(isFailSubStageCode("failed")).toBe(true);
    expect(isFailSubStageCode("Failed")).toBe(true);
    expect(isFailSubStageCode("FAIL")).toBe(true);
    expect(isFailSubStageCode("cv_fail")).toBe(true);
  });

  it("matches codes containing 'reject' (case-insensitive), per the seeded 'rejected' offer sub-stage convention", () => {
    expect(isFailSubStageCode("rejected")).toBe(true);
    expect(isFailSubStageCode("Rejected")).toBe(true);
    expect(isFailSubStageCode("REJECT")).toBe(true);
  });

  it("does not match unrelated codes", () => {
    expect(isFailSubStageCode("new")).toBe(false);
    expect(isFailSubStageCode("passed")).toBe(false);
    expect(isFailSubStageCode("matched")).toBe(false);
    expect(isFailSubStageCode("offer")).toBe(false);
    expect(isFailSubStageCode("consider")).toBe(false);
    expect(isFailSubStageCode("canceled")).toBe(false);
  });

  it("returns false for null/undefined/empty", () => {
    expect(isFailSubStageCode(null)).toBe(false);
    expect(isFailSubStageCode(undefined)).toBe(false);
    expect(isFailSubStageCode("")).toBe(false);
  });
});

describe("isEligibleForBulkMoveToInterview", () => {
  it("is eligible for any non-failed cv_scan sub-stage", () => {
    expect(isEligibleForBulkMoveToInterview("cv_scan", "new")).toBe(true);
    expect(isEligibleForBulkMoveToInterview("cv_scan", "passed")).toBe(true);
    expect(isEligibleForBulkMoveToInterview("cv_scan", "consider")).toBe(true);
    expect(isEligibleForBulkMoveToInterview("CV_SCAN", "New")).toBe(true);
  });

  it("excludes cv_scan sub-stages matching the fail/reject convention", () => {
    expect(isEligibleForBulkMoveToInterview("cv_scan", "failed")).toBe(false);
  });

  it("excludes candidates outside the cv_scan stage", () => {
    expect(isEligibleForBulkMoveToInterview("interview", "interview")).toBe(false);
    expect(isEligibleForBulkMoveToInterview("offer", "offer")).toBe(false);
    expect(isEligibleForBulkMoveToInterview(null, "new")).toBe(false);
    expect(isEligibleForBulkMoveToInterview(undefined, undefined)).toBe(false);
  });
});
