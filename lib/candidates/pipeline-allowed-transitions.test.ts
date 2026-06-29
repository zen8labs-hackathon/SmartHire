import { describe, expect, it } from "vitest";

import type { CandidateStatus } from "@/lib/candidates/types";
import { CANDIDATE_PIPELINE_STATUSES } from "@/lib/candidates/types";

import {
  ALL_PIPELINE_STATUSES,
  allowedTargetsFromStatus,
  isPipelineTransitionAllowed,
} from "./pipeline-allowed-transitions";

describe("isPipelineTransitionAllowed", () => {
  it("allows free movement within the same pipeline phase", () => {
    // CV Scan phase movement
    expect(isPipelineTransitionAllowed("New", "Consider")).toBe(true);
    expect(isPipelineTransitionAllowed("CvPassed", "CvFailed")).toBe(true);

    // Interview phase movement
    expect(isPipelineTransitionAllowed("Interview", "InterviewPassed")).toBe(true);
    expect(isPipelineTransitionAllowed("InterviewConsider", "InterviewFailed")).toBe(true);

    // Offer phase movement
    expect(isPipelineTransitionAllowed("Offer", "Matched")).toBe(true);
    expect(isPipelineTransitionAllowed("Matched", "Rejected")).toBe(true);
  });

  it("controls forward phase transitions to prevent stage skipping", () => {
    // CV Scan to Interview: only from CvPassed to Interview or InterviewConsider
    expect(isPipelineTransitionAllowed("CvPassed", "Interview")).toBe(true);
    expect(isPipelineTransitionAllowed("CvPassed", "InterviewConsider")).toBe(true);
    expect(isPipelineTransitionAllowed("New", "Interview")).toBe(false);
    expect(isPipelineTransitionAllowed("Consider", "Interview")).toBe(false);
    expect(isPipelineTransitionAllowed("CvFailed", "Interview")).toBe(false);

    // Interview to Offer: only from InterviewPassed to Offer or Rejected
    expect(isPipelineTransitionAllowed("InterviewPassed", "Offer")).toBe(true);
    expect(isPipelineTransitionAllowed("InterviewPassed", "Rejected")).toBe(true);
    expect(isPipelineTransitionAllowed("Interview", "Offer")).toBe(false);
    expect(isPipelineTransitionAllowed("InterviewConsider", "Offer")).toBe(false);
    expect(isPipelineTransitionAllowed("InterviewFailed", "Offer")).toBe(false);
  });

  it("allows rollbacks to the immediate previous phase", () => {
    // Interview to CV Scan: only if from is Interview, InterviewConsider, or InterviewCanceled
    expect(isPipelineTransitionAllowed("Interview", "CvPassed")).toBe(true);
    expect(isPipelineTransitionAllowed("InterviewConsider", "New")).toBe(true);
    expect(isPipelineTransitionAllowed("InterviewCanceled", "Consider")).toBe(true);
    expect(isPipelineTransitionAllowed("InterviewPassed", "CvPassed")).toBe(false);
    expect(isPipelineTransitionAllowed("InterviewFailed", "New")).toBe(false);

    // Offer to Interview: only if from is Offer or Rejected
    expect(isPipelineTransitionAllowed("Offer", "Interview")).toBe(true);
    expect(isPipelineTransitionAllowed("Rejected", "InterviewPassed")).toBe(true);
    expect(isPipelineTransitionAllowed("Matched", "Interview")).toBe(false);
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
  it("returns only allowed pipeline target statuses for the current status", () => {
    // For InterviewPassed: same phase + forward to Offer & Rejected
    expect(allowedTargetsFromStatus("InterviewPassed").sort()).toEqual(
      [
        "Interview",
        "InterviewConsider",
        "InterviewCanceled",
        "InterviewPassed",
        "InterviewFailed",
        "Offer",
        "Rejected",
      ].sort(),
    );
  });
});
