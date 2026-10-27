import { describe, expect, it } from "vitest";
import { deriveJdState, draftNote, failureNote, JD_PROCESSING_TIMEOUT_MS } from "./jd-state";

const now = new Date("2026-01-01T12:00:00Z");
const base = {
  status: "Pending" as const,
  jd_storage_path: "job_descriptions/x/a.pdf",
  update_note: draftNote() as string | null,
  role_overview: null as string | null,
  duties_and_responsibilities: null as string | null,
  experience_requirements_must_have: null as string | null,
  updated_at: new Date(now.getTime() - 1000),
};

describe("deriveJdState", () => {
  it("is null for non-drafts and blank drafts", () => {
    expect(deriveJdState({ ...base, status: "Hiring" }, now).state).toBeNull();
    expect(deriveJdState({ ...base, update_note: null }, now).state).toBeNull();
    expect(deriveJdState({ ...base, jd_storage_path: null }, now).state).toBeNull();
  });
  it("processing when nothing extracted yet", () => {
    expect(deriveJdState(base, now).state).toBe("processing");
  });
  it("done when fields are filled", () => {
    expect(deriveJdState({ ...base, role_overview: "x" }, now).state).toBe("done");
  });
  it("failed from marker, with error text", () => {
    const r = deriveJdState({ ...base, update_note: failureNote("boom") }, now);
    expect(r).toEqual({ state: "failed", error: "boom" });
  });
  it("failed after timeout", () => {
    const old = new Date(now.getTime() - JD_PROCESSING_TIMEOUT_MS - 1);
    expect(deriveJdState({ ...base, updated_at: old }, now).state).toBe("failed");
  });
});
