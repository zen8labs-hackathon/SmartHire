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
