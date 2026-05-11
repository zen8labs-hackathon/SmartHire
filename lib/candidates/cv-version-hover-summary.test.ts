import { describe, expect, it } from "vitest";

import type { CandidateCvPreviousSnapshot } from "@/lib/candidates/cv-history-types";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import { normalizeParsedResume } from "@/lib/candidates/normalize-parsed-resume";

import { buildCvVersionHoverSummaryLines } from "./cv-version-hover-summary";

function minimalDb(overrides: Partial<CandidateDbRow>): CandidateDbRow {
  return {
    id: "c1",
    job_opening_id: null,
    cv_storage_path: "p",
    original_filename: "cv.pdf",
    mime_type: "application/pdf",
    parsing_status: "completed",
    parsing_error: null,
    parsed_payload: {},
    name: "N",
    role: "Engineer",
    avatar_url: null,
    experience_years: 3,
    skills: null,
    degree: null,
    school: null,
    status: "New",
    source: "LinkedIn",
    source_other: null,
    created_at: "2020-01-01",
    updated_at: "2020-01-02",
    ...overrides,
  };
}

function snap(
  parsed: Record<string, unknown>,
  role: string | null = "Old title",
): CandidateCvPreviousSnapshot {
  return {
    id: "snap1",
    name: "N",
    role,
    cvUploadedAt: "2020-01-01",
    parsingStatus: "completed",
    parsedPayload: parsed,
    originalFilename: "old.pdf",
  };
}

describe("buildCvVersionHoverSummaryLines", () => {
  it("returns a message when snapshot is null", () => {
    const db = minimalDb({
      parsed_payload: { skills: [] },
      skills: [],
    });
    const ap = normalizeParsedResume(db.parsed_payload);
    expect(buildCvVersionHoverSummaryLines(null, db, ap)).toEqual([
      "No snapshot stored for this version.",
    ]);
  });

  it("detects added skills vs archived version", () => {
    const db = minimalDb({
      skills: ["React", "Go"],
      parsed_payload: { skills: ["React", "Go"] },
    });
    const ap = normalizeParsedResume(db.parsed_payload);
    const s = snap({ skills: ["React"], phone: "111", email: "a@a.com" });
    const lines = buildCvVersionHoverSummaryLines(s, db, ap);
    expect(lines.some((l) => l.includes("+1 skill") && l.includes("Go"))).toBe(
      true,
    );
  });

  it("detects phone change", () => {
    const db = minimalDb({
      skills: ["X"],
      parsed_payload: {
        skills: ["X"],
        phone: "222-000",
        email: "same@x.com",
      },
    });
    const ap = normalizeParsedResume(db.parsed_payload);
    const s = snap({
      skills: ["X"],
      phone: "111-999",
      email: "same@x.com",
    });
    const lines = buildCvVersionHoverSummaryLines(s, db, ap);
    expect(lines.some((l) => l.includes("Phone differs"))).toBe(true);
  });
});
