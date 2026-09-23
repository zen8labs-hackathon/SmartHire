import { describe, expect, it } from "vitest";
import {
  isCandidateInFinalPassedStage,
  isCandidateInOfferStage,
} from "./pipeline-status-styles";

describe("isCandidateInOfferStage", () => {
  const offerStageSubStateIds = new Set(["sub-offer-offer", "sub-offer-matched", "sub-offer-rejected"]);

  it("tier 1: uses currentSubStateId membership when offerStageSubStateIds is present", () => {
    expect(
      isCandidateInOfferStage({ currentSubStateId: "sub-offer-offer" }, offerStageSubStateIds),
    ).toBe(true);
    expect(
      isCandidateInOfferStage({ currentSubStateId: "sub-offer-matched" }, offerStageSubStateIds),
    ).toBe(true);
    expect(
      isCandidateInOfferStage({ currentSubStateId: "sub-offer-rejected" }, offerStageSubStateIds),
    ).toBe(true);
    expect(
      isCandidateInOfferStage({ currentSubStateId: "sub-interview-passed" }, offerStageSubStateIds),
    ).toBe(false);
  });

  it("tier 2: falls back to pipeline_status stage prefix when currentSubStateId is absent", () => {
    expect(
      isCandidateInOfferStage({ pipelineStatus: "offer:offer" }, offerStageSubStateIds),
    ).toBe(true);
    expect(
      isCandidateInOfferStage({ pipelineStatus: "offer:matched" }, offerStageSubStateIds),
    ).toBe(true);
    expect(
      isCandidateInOfferStage({ pipelineStatus: "offer:rejected" }, offerStageSubStateIds),
    ).toBe(true);
    expect(
      isCandidateInOfferStage({ pipelineStatus: "interview:passed" }, offerStageSubStateIds),
    ).toBe(false);
  });

  it("tier 3: falls back to legacy status when neither of the above is available", () => {
    expect(isCandidateInOfferStage({ status: "Offer" }, offerStageSubStateIds)).toBe(true);
    expect(isCandidateInOfferStage({ status: "Matched" }, offerStageSubStateIds)).toBe(true);
    expect(isCandidateInOfferStage({ status: "Rejected" }, offerStageSubStateIds)).toBe(true);
    expect(isCandidateInOfferStage({ status: "Interview" }, offerStageSubStateIds)).toBe(false);
    expect(isCandidateInOfferStage({ status: "New" }, offerStageSubStateIds)).toBe(false);
  });

  it("returns false when every field is null/undefined", () => {
    expect(isCandidateInOfferStage({}, offerStageSubStateIds)).toBe(false);
    expect(
      isCandidateInOfferStage(
        { currentSubStateId: null, pipelineStatus: null, status: null },
        offerStageSubStateIds,
      ),
    ).toBe(false);
    expect(isCandidateInOfferStage({}, null)).toBe(false);
  });

  it("does not use currentSubStateId when offerStageSubStateIds itself is not resolved", () => {
    // Without a resolved set, tier 1 can't be evaluated so it falls through.
    expect(
      isCandidateInOfferStage({ currentSubStateId: "some-id", status: "Offer" }, null),
    ).toBe(true);
    expect(
      isCandidateInOfferStage({ currentSubStateId: "some-id", status: "New" }, null),
    ).toBe(false);
    expect(
      isCandidateInOfferStage({ currentSubStateId: "some-id", status: "Offer" }, new Set()),
    ).toBe(true);
  });
});

describe("isCandidateInFinalPassedStage", () => {
  const finalStagePassedSubStateIds = new Set(["sub-offer-matched"]);

  it("tier 1: uses currentSubStateId membership when finalStagePassedSubStateIds is present", () => {
    expect(
      isCandidateInFinalPassedStage(
        { currentSubStateId: "sub-offer-matched" },
        finalStagePassedSubStateIds,
      ),
    ).toBe(true);
    // Still in the final stage, but not its "passed" sub-stage -- unlike
    // isCandidateInOfferStage, this must not light up.
    expect(
      isCandidateInFinalPassedStage(
        { currentSubStateId: "sub-offer-offer" },
        finalStagePassedSubStateIds,
      ),
    ).toBe(false);
    expect(
      isCandidateInFinalPassedStage(
        { currentSubStateId: "sub-offer-rejected" },
        finalStagePassedSubStateIds,
      ),
    ).toBe(false);
  });

  it("tier 2: falls back to legacy status when currentSubStateId is absent", () => {
    expect(
      isCandidateInFinalPassedStage({ status: "Matched" }, finalStagePassedSubStateIds),
    ).toBe(true);
    expect(
      isCandidateInFinalPassedStage({ status: "Offer" }, finalStagePassedSubStateIds),
    ).toBe(false);
    expect(
      isCandidateInFinalPassedStage({ status: "Rejected" }, finalStagePassedSubStateIds),
    ).toBe(false);
  });

  it("returns false when every field is null/undefined", () => {
    expect(isCandidateInFinalPassedStage({}, finalStagePassedSubStateIds)).toBe(false);
    expect(isCandidateInFinalPassedStage({}, null)).toBe(false);
  });

  it("does not use currentSubStateId when finalStagePassedSubStateIds itself is not resolved", () => {
    expect(
      isCandidateInFinalPassedStage({ currentSubStateId: "some-id", status: "Matched" }, null),
    ).toBe(true);
    expect(
      isCandidateInFinalPassedStage({ currentSubStateId: "some-id", status: "Offer" }, null),
    ).toBe(false);
    expect(
      isCandidateInFinalPassedStage(
        { currentSubStateId: "some-id", status: "Matched" },
        new Set(),
      ),
    ).toBe(true);
  });
});
