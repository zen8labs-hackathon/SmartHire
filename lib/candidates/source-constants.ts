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

const SOURCE_CHIP_CLASS: Record<CandidateSource, string> = {
  LinkedIn: "border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-500/50 dark:bg-sky-500/25 dark:text-sky-200",
  TopCV: "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-500/50 dark:bg-emerald-500/25 dark:text-emerald-200",
  ITViec: "border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-500/50 dark:bg-orange-500/25 dark:text-orange-200",
  Facebook: "border-indigo-300 bg-indigo-100 text-indigo-800 dark:border-indigo-500/50 dark:bg-indigo-500/25 dark:text-indigo-200",
  TopDev: "border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-500/50 dark:bg-violet-500/25 dark:text-violet-200",
  Other: "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-500/50 dark:bg-amber-500/25 dark:text-amber-200",
};

/** Color classes for a source chip. Accepts a raw source or a formatted label like `Other (referral)`. */
export function candidateSourceChipClass(sourceOrLabel: string): string {
  if (isCandidateSource(sourceOrLabel)) return SOURCE_CHIP_CLASS[sourceOrLabel];
  if (sourceOrLabel.startsWith("Other")) return SOURCE_CHIP_CLASS.Other;
  return SOURCE_CHIP_CLASS.Other;
}
