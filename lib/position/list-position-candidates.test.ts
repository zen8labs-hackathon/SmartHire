import { describe, expect, it } from "vitest";
import type { CampaignAppliedAdminRow } from "@/lib/db/campaign-applied-list";
import { matchStatusToScoring, rowToPositionCandidate, scoreToBand } from "./list-position-candidates";

const now = new Date("2026-01-10T00:00:00Z");

function row(over: Partial<CampaignAppliedAdminRow> = {}): CampaignAppliedAdminRow {
  return {
    id: "a1",
    candidate_id: "c1",
    job_id: "j1",
    source: "LinkedIn",
    source_other: null,
    expected_salary: "$2000",
    jd_match_score: 72,
    jd_match_status: "completed",
    jd_match_error: null,
    created_at: new Date("2026-01-01T00:00:00Z"),
    updated_at: new Date("2026-01-08T12:00:00Z"),
    candidate_name: "An Nguyen",
    candidate_role: "Backend Engineer",
    candidate_experience_years: "4",
    candidate_degree: "BSc",
    current_job_stage_mapping_id: "m1",
    current_sub_state_id: "s1",
    stage_label: "CV Scan",
    sub_stage_label: "New",
    ...over,
  } as CampaignAppliedAdminRow;
}

describe("scoreToBand", () => {
  it("applies thresholds", () => {
    expect(scoreToBand(80, "completed")).toBe("strong");
    expect(scoreToBand(79, "completed")).toBe("good");
    expect(scoreToBand(65, "completed")).toBe("good");
    expect(scoreToBand(50, "completed")).toBe("partial");
    expect(scoreToBand(49, "completed")).toBe("limited");
    expect(scoreToBand(null, "pending")).toBeNull();
  });
  it("is review when scoring failed", () => {
    expect(scoreToBand(null, "failed")).toBe("review");
  });
});

describe("matchStatusToScoring", () => {
  it("maps statuses", () => {
    expect(matchStatusToScoring("completed", 70)).toBe("done");
    expect(matchStatusToScoring("pending", null)).toBe("scoring");
    expect(matchStatusToScoring("processing", null)).toBe("scoring");
    expect(matchStatusToScoring("failed", null)).toBe("error");
    expect(matchStatusToScoring("completed", null)).toBe("none");
    expect(matchStatusToScoring(null, null)).toBe("none");
  });
});

describe("rowToPositionCandidate", () => {
  it("maps fields", () => {
    const c = rowToPositionCandidate(row(), { viewSalary: true, now });
    expect(c).toMatchObject({
      name: "An Nguyen",
      headline: "Backend Engineer · 4 yrs",
      band: "good",
      score: 72,
      scoring: "done",
      expectedSalary: "$2000",
      daysInStage: 1,
      source: "LinkedIn",
    });
  });
  it("redacts salary", () => {
    expect(rowToPositionCandidate(row(), { viewSalary: false, now }).expectedSalary).toBeNull();
  });
  it("uses source_other and falls back to degree headline", () => {
    const c = rowToPositionCandidate(
      row({ source: "Other", source_other: "Job fair", candidate_role: null, candidate_experience_years: null }),
      { viewSalary: true, now },
    );
    expect(c.source).toBe("Job fair");
    expect(c.headline).toBe("BSc");
  });
  it("failed scoring exposes error and review band", () => {
    const c = rowToPositionCandidate(
      row({ jd_match_status: "failed", jd_match_score: null, jd_match_error: "boom" }),
      { viewSalary: true, now },
    );
    expect(c).toMatchObject({ scoring: "error", band: "review", scoringError: "boom", score: null });
  });
});
