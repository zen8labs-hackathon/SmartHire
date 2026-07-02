import { describe, expect, it } from "vitest";
import { isCandidateInOfferSubStage } from "./pipeline-status-styles";

describe("isCandidateInOfferSubStage", () => {
  const offerSubStageId = "sub-offer-offer";

  it("tier 1: uses currentSubStateId when both it and offerSubStageId are present", () => {
    expect(
      isCandidateInOfferSubStage({ currentSubStateId: offerSubStageId }, offerSubStageId),
    ).toBe(true);
    expect(
      isCandidateInOfferSubStage({ currentSubStateId: "sub-offer-matched" }, offerSubStageId),
    ).toBe(false);
  });

  it("tier 2: falls back to pipeline_status text when currentSubStateId is absent", () => {
    expect(
      isCandidateInOfferSubStage({ pipelineStatus: "offer:offer" }, offerSubStageId),
    ).toBe(true);
    expect(
      isCandidateInOfferSubStage({ pipelineStatus: "offer:matched" }, offerSubStageId),
    ).toBe(false);
    expect(
      isCandidateInOfferSubStage({ pipelineStatus: "offer:rejected" }, offerSubStageId),
    ).toBe(false);
  });

  it("tier 3: falls back to legacy status when neither of the above is available", () => {
    expect(isCandidateInOfferSubStage({ status: "Offer" }, offerSubStageId)).toBe(true);
    expect(isCandidateInOfferSubStage({ status: "Matched" }, offerSubStageId)).toBe(false);
    expect(isCandidateInOfferSubStage({ status: "Rejected" }, offerSubStageId)).toBe(false);
  });

  it("returns false when every field is null/undefined", () => {
    expect(isCandidateInOfferSubStage({}, offerSubStageId)).toBe(false);
    expect(
      isCandidateInOfferSubStage(
        { currentSubStateId: null, pipelineStatus: null, status: null },
        offerSubStageId,
      ),
    ).toBe(false);
    expect(isCandidateInOfferSubStage({}, null)).toBe(false);
  });

  it("does not use currentSubStateId when offerSubStageId itself is not resolved", () => {
    // Without a resolved offerSubStageId, tier 1 can't be evaluated so it falls through.
    expect(
      isCandidateInOfferSubStage({ currentSubStateId: "some-id", status: "Offer" }, null),
    ).toBe(true);
    expect(
      isCandidateInOfferSubStage({ currentSubStateId: "some-id", status: "New" }, null),
    ).toBe(false);
  });
});
