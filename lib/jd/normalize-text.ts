/** Values that should be treated as empty (common LLM / JSON noise). */
const PLACEHOLDER_TOKENS = new Set([
  "null",
  "undefined",
  "n/a",
  "na",
  "none",
  "-",
  "—",
]);

/**
 * Normalizes arbitrary input from forms, AI JSON, or APIs into a clean string.
 * Never returns the literal "null" / "undefined" as content.
 */
export function normalizeFormText(input: unknown): string {
  if (input == null) return "";
  const s = typeof input === "string" ? input : String(input);
  const t = s.trim();
  if (t === "") return "";
  const lower = t.toLowerCase();
  if (PLACEHOLDER_TOKENS.has(lower)) return "";
  return t;
}

/** Empty after normalize → SQL NULL; otherwise trimmed (and max length). */
export function optionalToDb(value: unknown, maxLen?: number): string | null {
  const n = normalizeFormText(value);
  if (n === "") return null;
  return maxLen != null ? n.slice(0, maxLen) : n;
}

/** Required single-line field: normalize + max length (may still be ""). */
export function requiredLine(value: unknown, maxLen: number): string {
  return normalizeFormText(value).slice(0, maxLen);
}

const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Empty or invalid → null; accepts YYYY-MM-DD or ISO datetime (date part used). */
export function optionalDateToDb(value: unknown): string | null {
  const n = normalizeFormText(value);
  if (n === "") return null;
  const ymd = n.length >= 10 ? n.slice(0, 10) : n;
  if (!DATE_ISO_RE.test(ymd)) return null;
  const [y, mo, d] = ymd.split("-").map(Number);
  const dt = new Date(y, mo - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return ymd;
}

/** YYYY-MM-DD for the current UTC calendar day (server default for end_date). */
export function utcDateStringToday(): string {
  return new Date().toISOString().slice(0, 10);
}
