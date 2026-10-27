import { describe, expect, it } from "vitest";

import { roundDetailsError } from "./validation";

const IV = ["11111111-1111-4111-8111-111111111111"];

describe("roundDetailsError", () => {
  it("requires an interviewer on a new round", () => {
    expect(roundDetailsError({ isNew: true, interviewerIds: undefined, mode: "online", location: null }))
      .toBe("Add at least one interviewer.");
    expect(roundDetailsError({ isNew: true, interviewerIds: [], mode: "online", location: null }))
      .toBe("Add at least one interviewer.");
  });

  it("lets an edit omit interviewers but not clear them", () => {
    expect(roundDetailsError({ isNew: false, interviewerIds: undefined, mode: "online", location: null })).toBeNull();
    expect(roundDetailsError({ isNew: false, interviewerIds: [], mode: "online", location: null }))
      .toBe("Add at least one interviewer.");
  });

  it("requires a location for in-office rounds", () => {
    expect(roundDetailsError({ isNew: true, interviewerIds: IV, mode: "office", location: "  " }))
      .toBe("Enter a location for an in-office interview.");
    expect(roundDetailsError({ isNew: true, interviewerIds: IV, mode: "office", location: "Room 3" })).toBeNull();
    expect(roundDetailsError({ isNew: true, interviewerIds: IV, mode: "online", location: "" })).toBeNull();
  });
});
