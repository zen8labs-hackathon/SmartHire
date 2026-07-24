/**
 * Derives total professional experience (years) from the earliest work-start
 * date on a resume when the CV never states an explicit "N years" figure.
 *
 * Accepts `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`. Returns null when the string
 * cannot be parsed or falls in the future.
 */
export function experienceYearsFromWorkStart(
  earliestWorkStart: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (earliestWorkStart == null) return null;
  const trimmed = earliestWorkStart.trim();
  if (!trimmed) return null;

  const start = parseWorkStartDate(trimmed);
  if (!start) return null;
  if (start.getTime() > now.getTime()) return null;

  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const years = (now.getTime() - start.getTime()) / msPerYear;
  if (!Number.isFinite(years) || years < 0) return null;

  // One decimal keeps month-level signal without noisy precision.
  return Math.round(years * 10) / 10;
}

function parseWorkStartDate(value: string): Date | null {
  const yearOnly = /^(\d{4})$/.exec(value);
  if (yearOnly) {
    const y = Number(yearOnly[1]);
    if (y < 1950 || y > 2100) return null;
    return new Date(y, 0, 1);
  }

  const yearMonth = /^(\d{4})-(\d{2})$/.exec(value);
  if (yearMonth) {
    const y = Number(yearMonth[1]);
    const m = Number(yearMonth[2]);
    if (y < 1950 || y > 2100 || m < 1 || m > 12) return null;
    return new Date(y, m - 1, 1);
  }

  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (full) {
    const y = Number(full[1]);
    const m = Number(full[2]);
    const d = Number(full[3]);
    if (y < 1950 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) {
      return null;
    }
    const dt = new Date(y, m - 1, d);
    if (
      dt.getFullYear() !== y ||
      dt.getMonth() !== m - 1 ||
      dt.getDate() !== d
    ) {
      return null;
    }
    return dt;
  }

  return null;
}
