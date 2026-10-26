import { describe, expect, it } from "vitest";

import { isAssignedMentor } from "@/lib/authz/probation-mentor";

describe("isAssignedMentor", () => {
  it("matches only the assigned Mentor", () => {
    expect(isAssignedMentor({ mentor_profile_id: "u1" }, "u1")).toBe(true);
    expect(isAssignedMentor({ mentor_profile_id: "u1" }, "u2")).toBe(false);
  });

  it("is false for legacy rows without a Mentor", () => {
    expect(isAssignedMentor({ mentor_profile_id: null }, "u1")).toBe(false);
  });
});
