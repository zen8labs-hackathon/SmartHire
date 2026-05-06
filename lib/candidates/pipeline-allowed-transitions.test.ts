import { describe, expect, it } from "vitest";

import type { CandidateStatus } from "@/lib/candidates/types";
import { CANDIDATE_PIPELINE_STATUSES } from "@/lib/candidates/types";

import {
  ALL_PIPELINE_STATUSES,
  allowedTargetsFromStatus,
  isPipelineTransitionAllowed,
} from "./pipeline-allowed-transitions";

describe("isPipelineTransitionAllowed", () => {
  it("allows every transition between distinct DB statuses (bidirectional)", () => {
    const statuses = [...CANDIDATE_PIPELINE_STATUSES] as CandidateStatus[];
    for (const a of statuses) {
      for (const b of statuses) {
        expect(isPipelineTransitionAllowed(a, b)).toBe(true);
      }
    }
  });

  it("allows cross-phase examples previously restricted", () => {
    expect(isPipelineTransitionAllowed("New", "Matched")).toBe(true);
    expect(isPipelineTransitionAllowed("Matched", "CvPassed")).toBe(true);
    expect(isPipelineTransitionAllowed("Rejected", "Interview")).toBe(true);
    expect(isPipelineTransitionAllowed("CvFailed", "Offer")).toBe(true);
  });

  it("rejects unknown statuses", () => {
    expect(isPipelineTransitionAllowed("New", "LegacyFoo")).toBe(false);
    expect(isPipelineTransitionAllowed("NotAStatus", "Interview")).toBe(false);
  });

  it("normalizes legacy DB statuses before checking transitions", () => {
    expect(isPipelineTransitionAllowed("Interviewing", "InterviewCanceled")).toBe(true);
    expect(isPipelineTransitionAllowed("Shortlisted", "CvFailed")).toBe(true);
    expect(isPipelineTransitionAllowed("interviewing", "InterviewPassed")).toBe(true);
  });

  it("is reflexive", () => {
    expect(isPipelineTransitionAllowed("Offer", "Offer")).toBe(true);
  });
});

describe("allowedTargetsFromStatus", () => {
  it("returns every pipeline status including current", () => {
    expect(allowedTargetsFromStatus("InterviewPassed").sort()).toEqual(
      [...ALL_PIPELINE_STATUSES].sort(),
    );
  });
});
