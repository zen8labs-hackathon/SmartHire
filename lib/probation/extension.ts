const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ExtensionCheck = { ok: true } | { ok: false; error: string };

function toYmd(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  return v.slice(0, 10);
}

/**
 * Validates a probation extension. The new end date must be a real
 * `YYYY-MM-DD`, strictly after the latest known end (previous extension, else
 * the start date) and not in the past; a reason is required.
 */
export function validateProbationExtension(input: {
  newEndDate: string;
  reason: string;
  startDate: string | Date | null;
  extendedUntil: string | Date | null;
  today: string;
}): ExtensionCheck {
  if (!input.reason.trim()) return { ok: false, error: "A reason is required to extend probation." };
  if (!DATE_RE.test(input.newEndDate) || Number.isNaN(Date.parse(`${input.newEndDate}T00:00:00Z`))) {
    return { ok: false, error: "The new end date must be a valid date (YYYY-MM-DD)." };
  }
  if (input.newEndDate < input.today) {
    return { ok: false, error: "The new end date cannot be in the past." };
  }
  const floor = toYmd(input.extendedUntil) ?? toYmd(input.startDate);
  if (floor && input.newEndDate <= floor) {
    return { ok: false, error: "The new end date must be after the current probation end." };
  }
  return { ok: true };
}
