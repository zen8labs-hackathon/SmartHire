import { describe, expect, it } from "vitest";

import {
  candidateCountFromOpeningEmbed,
  sumApplicantCountsByJobDescriptionId,
  type JobOpeningWithCandidateCount,
} from "@/lib/jd/applicant-counts";

describe("candidateCountFromOpeningEmbed", () => {
  it("reads count from array embed", () => {
    expect(candidateCountFromOpeningEmbed([{ count: 3 }])).toBe(3);
  });

  it("returns 0 when embed is missing", () => {
    expect(candidateCountFromOpeningEmbed(null)).toBe(0);
    expect(candidateCountFromOpeningEmbed(undefined)).toBe(0);
  });
});

describe("sumApplicantCountsByJobDescriptionId", () => {
  it("sums counts across openings for the same JD", () => {
    const openings: JobOpeningWithCandidateCount[] = [
      { job_description_id: 1, candidates: [{ count: 2 }] },
      { job_description_id: 1, candidates: [{ count: 5 }] },
      { job_description_id: 2, candidates: [{ count: 1 }] },
    ];
    const map = sumApplicantCountsByJobDescriptionId(openings);
    expect(map.get(1)).toBe(7);
    expect(map.get(2)).toBe(1);
  });
});
