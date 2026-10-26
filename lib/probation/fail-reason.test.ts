import { describe, expect, it } from "vitest";

import { validateProbationFailReason } from "@/lib/probation/fail-reason";

const fail = { is_terminal: true, is_passed: false, is_withdraw: false };
const pass = { is_terminal: true, is_passed: true, is_withdraw: false };
const withdraw = { is_terminal: true, is_passed: false, is_withdraw: true };
const base = { targetIsProbation: true, subChanged: true, targetSub: fail };

describe("validateProbationFailReason", () => {
  it("rejects Not pass without a reason", () => {
    expect(validateProbationFailReason({ ...base, reason: undefined }).ok).toBe(false);
    expect(validateProbationFailReason({ ...base, reason: null }).ok).toBe(false);
  });
  it("rejects a whitespace-only reason", () => {
    expect(validateProbationFailReason({ ...base, reason: "   " }).ok).toBe(false);
  });
  it("accepts Not pass with a reason", () => {
    expect(validateProbationFailReason({ ...base, reason: "Missed targets" }).ok).toBe(true);
  });
  it("ignores Pass, withdraw, non-probation stages and unchanged sub-states", () => {
    expect(validateProbationFailReason({ ...base, targetSub: pass, reason: "" }).ok).toBe(true);
    expect(validateProbationFailReason({ ...base, targetSub: withdraw, reason: "" }).ok).toBe(true);
    expect(validateProbationFailReason({ ...base, targetIsProbation: false, reason: "" }).ok).toBe(true);
    expect(validateProbationFailReason({ ...base, subChanged: false, reason: "" }).ok).toBe(true);
  });
});
