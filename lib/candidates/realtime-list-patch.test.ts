import { describe, expect, it } from "vitest";

import type { CandidateDbRow } from "@/lib/candidates/db-row";
import {
  applyCandidatesRealtimeChange,
  applyCandidatesRealtimeBatch,
  candidateListRowNeedsJobOpeningHydrate,
  mergeRealtimeIntoCandidateListRow,
} from "@/lib/candidates/realtime-list-patch";

const baseRow = (overrides: Partial<CandidateDbRow> = {}): CandidateDbRow =>
  ({
    id: "a1",
    job_opening_id: "jo-1",
    cv_storage_path: "x/cv.pdf",
    original_filename: "cv.pdf",
    mime_type: "application/pdf",
    parsing_status: "completed",
    parsing_error: null,
    name: "Ada",
    role: "Engineer",
    avatar_url: null,
    experience_years: 3,
    skills: ["TS"],
    degree: null,
    school: null,
    status: "New",
    source: "direct",
    source_other: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    parsed_payload: { email: "ada@test.com" },
    job_openings: { id: "jo-1", title: "Role A", job_descriptions: null },
    ...overrides,
  }) as CandidateDbRow;

describe("mergeRealtimeIntoCandidateListRow", () => {
  it("preserves parsed_payload and job_openings from existing row", () => {
    const existing = baseRow();
    const merged = mergeRealtimeIntoCandidateListRow(existing, {
      id: "a1",
      name: "Ada Lovelace",
      status: "CvPassed",
    });
    expect(merged.name).toBe("Ada Lovelace");
    expect(merged.status).toBe("CvPassed");
    expect(merged.parsed_payload).toEqual({ email: "ada@test.com" });
    expect(merged.job_openings).toEqual(existing.job_openings);
  });
});

describe("applyCandidatesRealtimeChange", () => {
  it("updates status without full refetch shape", () => {
    const rows = [baseRow()];
    const next = applyCandidatesRealtimeChange(rows, {
      eventType: "UPDATE",
      new: { id: "a1", status: "Interview", is_active: true },
      old: { id: "a1" },
    });
    expect(next).toHaveLength(1);
    expect(next[0]?.status).toBe("Interview");
    expect(next[0]?.parsed_payload).toEqual({ email: "ada@test.com" });
  });

  it("removes row when is_active becomes false", () => {
    const rows = [baseRow()];
    const next = applyCandidatesRealtimeChange(rows, {
      eventType: "UPDATE",
      new: { id: "a1", is_active: false },
      old: { id: "a1" },
    });
    expect(next).toHaveLength(0);
  });

  it("inserts new active candidate at front", () => {
    const next = applyCandidatesRealtimeChange([], {
      eventType: "INSERT",
      new: {
        id: "b2",
        is_active: true,
        name: "Bob",
        original_filename: "b.pdf",
        parsing_status: "pending",
      },
      old: null,
    });
    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe("b2");
  });

  it("deletes by id", () => {
    const rows = [baseRow(), baseRow({ id: "b2" })];
    const next = applyCandidatesRealtimeChange(rows, {
      eventType: "DELETE",
      new: null,
      old: { id: "a1" },
    });
    expect(next.map((r) => r.id)).toEqual(["b2"]);
  });
});

describe("candidateListRowNeedsJobOpeningHydrate", () => {
  it("is true when job opening is set but embed is missing", () => {
    expect(
      candidateListRowNeedsJobOpeningHydrate(
        baseRow({ job_openings: null }),
      ),
    ).toBe(true);
    expect(
      candidateListRowNeedsJobOpeningHydrate(
        baseRow({ job_opening_id: null, job_openings: null }),
      ),
    ).toBe(false);
  });
});

describe("applyCandidatesRealtimeBatch", () => {
  it("applies multiple events in order", () => {
    const rows = [baseRow()];
    const next = applyCandidatesRealtimeBatch(rows, [
      {
        eventType: "UPDATE",
        new: { id: "a1", status: "CvPassed", is_active: true },
        old: { id: "a1" },
      },
      {
        eventType: "UPDATE",
        new: { id: "a1", status: "Interview", is_active: true },
        old: { id: "a1" },
      },
    ]);
    expect(next[0]?.status).toBe("Interview");
  });
});
