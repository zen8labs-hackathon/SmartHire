/**
 * Guards `earliestWorkStart` from the resume LLM so education enrollment /
 * graduation dates are never used to derive professional `experienceYears`.
 *
 * The model is already instructed to exclude education-only rows, but it still
 * sometimes returns a university start year for interns / fresh grads. This
 * post-check looks at where that year appears in the CV text:
 * - Reject when the year only shows up under Education (or never appears).
 * - Keep when it also appears under Work Experience / Employment / Internship.
 */

const EDUCATION_HEADER =
  /^(?:education|học\s*vấn|academic(?:\s+background)?|qualifications?|học\s*tập|bằng\s*cấp|trình\s*độ\s*học\s*vấn)\b/i;

const WORK_HEADER =
  /^(?:work\s+experience|professional\s+experience|employment(?:\s+history)?|career(?:\s+history)?|kinh\s*nghiệm(?:\s*làm\s*việc)?|internships?|thực\s*tập(?:\s*sinh)?|projects?|dự\s*án)\b/i;

/** Bare "Experience" is usually the work section; exclude soft phrases. */
const BARE_EXPERIENCE_HEADER = /^experience\s*$/i;

type SectionKind = "work" | "education" | "other";

function classifyHeaderLine(line: string): SectionKind | null {
  const t = line.trim();
  if (!t || t.length > 80) return null;
  if (EDUCATION_HEADER.test(t)) return "education";
  if (WORK_HEADER.test(t) || BARE_EXPERIENCE_HEADER.test(t)) return "work";
  return null;
}

/**
 * Splits resume plain text into coarse section buckets by common CV headers.
 * Content before the first recognized header goes into `other`.
 */
export function splitResumeSections(plainText: string): {
  work: string;
  education: string;
  other: string;
} {
  const lines = plainText.split(/\r?\n/);
  let current: SectionKind = "other";
  const buckets: Record<SectionKind, string[]> = {
    work: [],
    education: [],
    other: [],
  };

  for (const line of lines) {
    const kind = classifyHeaderLine(line);
    if (kind) {
      current = kind;
      continue;
    }
    buckets[current].push(line);
  }

  return {
    work: buckets.work.join("\n"),
    education: buckets.education.join("\n"),
    other: buckets.other.join("\n"),
  };
}

function yearFromWorkStart(earliestWorkStart: string): string | null {
  const m = /^(\d{4})(?:-\d{2}(?:-\d{2})?)?$/.exec(earliestWorkStart.trim());
  return m?.[1] ?? null;
}

function sectionMentionsYear(section: string, year: string): boolean {
  if (!section.trim()) return false;
  // Word-ish boundary so "2019" does not match inside "20190".
  const re = new RegExp(`(^|[^0-9])${year}([^0-9]|$)`);
  return re.test(section);
}

/**
 * Returns `earliestWorkStart` unchanged when it looks like a real work-history
 * milestone; returns `null` when it is missing, unparseable, absent from the
 * CV text, or only attested under Education.
 */
export function sanitizeEarliestWorkStart(
  plainText: string,
  earliestWorkStart: string | null | undefined,
): string | null {
  if (earliestWorkStart == null) return null;
  const trimmed = earliestWorkStart.trim();
  if (!trimmed) return null;

  const year = yearFromWorkStart(trimmed);
  if (!year) return null;

  // Model invented a date that never appears in the CV.
  if (!sectionMentionsYear(plainText, year)) return null;

  const { work, education, other } = splitResumeSections(plainText);
  const inWork = sectionMentionsYear(work, year);
  const inEducation = sectionMentionsYear(education, year);
  const inOther = sectionMentionsYear(other, year);

  // Clear education-only hit (classic intern / student overcount).
  if (inEducation && !inWork) return null;

  // Appears under Work Experience / Internship / Projects → keep.
  if (inWork) return trimmed;

  // No recognizable section headers (or year only in summary / header area):
  // keep the AI value -- prompt already forbids education-only starts, and
  // rejecting here would drop many valid CVs without section titles.
  if (inOther) return trimmed;

  return null;
}

export type WorkPeriodInput = {
  start: string;
  end: string | null;
};

/**
 * Drops work intervals whose start year is missing from the CV or only
 * appears under Education (same rule as {@link sanitizeEarliestWorkStart}).
 */
export function sanitizeWorkPeriods(
  plainText: string,
  periods: WorkPeriodInput[] | null | undefined,
): WorkPeriodInput[] {
  if (!periods?.length) return [];

  const kept: WorkPeriodInput[] = [];
  for (const period of periods) {
    const start = sanitizeEarliestWorkStart(plainText, period.start);
    if (!start) continue;
    const endRaw = period.end?.trim() || null;
    kept.push({ start, end: endRaw });
  }
  return kept;
}
