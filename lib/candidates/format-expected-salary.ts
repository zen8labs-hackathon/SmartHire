/**
 * Display helper for free-text `expected_salary`.
 * Pure numbers / numeric ranges get vi-VN thousand separators;
 * notes like "20 triệu" or "negotiable" stay as trimmed text.
 */
export function formatExpectedSalaryDisplay(
  raw: string | null | undefined,
): string {
  if (raw == null) return "—";
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return "—";

  const digitsOnly = (part: string) => part.replace(/[.,\s]/g, "");
  const formatVn = (part: string): string | null => {
    const digits = digitsOnly(part);
    if (!/^\d+$/.test(digits)) return null;
    const n = Number(digits);
    if (!Number.isFinite(n)) return null;
    return n.toLocaleString("vi-VN");
  };

  const range = s.match(/^(\d[\d.,]*)\s*[-–~—]\s*(\d[\d.,]*)$/);
  if (range) {
    const a = formatVn(range[1]);
    const b = formatVn(range[2]);
    if (a && b) return `${a} – ${b}`;
  }

  const single = s.match(/^(\d[\d.,]*)$/);
  if (single) {
    const a = formatVn(single[1]);
    if (a) return a;
  }

  return s;
}
