import { normalizeFormText } from "@/lib/jd/normalize-text";

export function normalizeForGroundingCheck(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * True when `value` likely comes from the document (substring or word overlap).
 * Rejects obvious AI hallucinations that do not appear in the source text.
 */
export function isGroundedInDocument(
  value: string,
  document: string,
  minAnchorLen = 10,
): boolean {
  const v = normalizeForGroundingCheck(value);
  const d = normalizeForGroundingCheck(document);
  if (!v) return false;
  if (v.length <= minAnchorLen) return d.includes(v);

  const anchor = v.slice(0, Math.min(48, v.length));
  if (d.includes(anchor)) return true;

  const words = v.split(/\s+/).filter((w) => w.length > 3);
  if (words.length < 4) return d.includes(v);

  const matched = words.filter((w) => d.includes(w)).length;
  return matched / words.length >= 0.55;
}

/** Label-parsed header fields beat AI; AI is used only when grounded in the document. */
export function pickHeaderField(
  heuristic: string,
  ai: string,
  document: string,
  maxLen?: number,
): string {
  const h = normalizeFormText(heuristic);
  const a = normalizeFormText(ai);
  let v = "";
  if (h) v = h;
  else if (a && isGroundedInDocument(a, document, 6)) v = a;
  return maxLen != null ? v.slice(0, maxLen) : v;
}

/** Prefer the longer grounded block; heuristic section slices are often more faithful. */
export function pickLongFormField(
  heuristic: string,
  ai: string,
  document: string,
): string {
  const h = normalizeFormText(heuristic);
  const a = normalizeFormText(ai);
  const hOk = Boolean(h) && isGroundedInDocument(h, document, 12);
  const aOk = Boolean(a) && isGroundedInDocument(a, document, 12);

  if (hOk && aOk) return a.length >= h.length * 0.85 ? a : h;
  if (hOk) return h;
  if (aOk) return a;
  return "";
}
