export const CANDIDATE_SOURCE_VALUES = [
  "LinkedIn",
  "TopCV",
  "ITViec",
  "Facebook",
  "TopDev",
  "Other",
] as const;

export type CandidateSource = (typeof CANDIDATE_SOURCE_VALUES)[number];

export function isCandidateSource(value: string): value is CandidateSource {
  return (CANDIDATE_SOURCE_VALUES as readonly string[]).includes(value);
}

export function formatCandidateSourceLabel(
  source: string,
  sourceOther: string | null | undefined,
): string {
  if (source === "Other") {
    const detail = sourceOther?.trim();
    return detail ? `Other (${detail})` : "Other";
  }
  return source;
}
