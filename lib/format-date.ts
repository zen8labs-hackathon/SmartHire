/**
 * App-wide human-readable date format: `yyyy/mm/dd`.
 *
 * Also used as the react-aria I18nProvider locale so DateField /
 * DateRangePicker segment order and separators match (`en-ZA` → Y/M/D with `/`).
 */
export const DISPLAY_DATE_LOCALE = "en-ZA";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function ymdParts(d: Date): string {
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}

/**
 * Format a calendar day or timestamp for UI display as `yyyy/mm/dd`.
 * Plain `YYYY-MM-DD` strings are treated as timezone-free calendar dates.
 */
export function formatDisplayDate(
  value: Date | string | number | null | undefined,
): string {
  if (value == null || value === "") return "—";

  if (typeof value === "string") {
    const trimmed = value.trim();
    const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  }

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return ymdParts(d);
}

/** Format a timestamp as `yyyy/mm/dd HH:mm` (local time). */
export function formatDisplayDateTime(
  value: Date | string | number | null | undefined,
): string {
  if (value == null || value === "") return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${ymdParts(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
