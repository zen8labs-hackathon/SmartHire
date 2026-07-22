function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Matches free-text (e.g. an AI/regex-extracted "department") against the
 * org's chapter list. Exact name match wins, then substring containment,
 * then word-prefix overlap (catches "Internship Team" -> chapter "Intern").
 * Returns null rather than guessing when nothing clears the overlap bar --
 * callers should leave chapter selection to the user in that case.
 */
export function matchChapterByName(
  text: string,
  chapters: readonly { id: string; name: string }[],
): { id: string; name: string } | null {
  const needle = normalize(text);
  if (!needle) return null;

  const exact = chapters.find((c) => normalize(c.name) === needle);
  if (exact) return exact;

  const containment = chapters.find((c) => {
    const hay = normalize(c.name);
    return hay.length > 0 && (needle.includes(hay) || hay.includes(needle));
  });
  if (containment) return containment;

  const needleTokens = needle.split(" ").filter(Boolean);
  let best: { chapter: { id: string; name: string }; score: number } | null =
    null;
  for (const c of chapters) {
    const hayTokens = normalize(c.name).split(" ").filter(Boolean);
    if (hayTokens.length === 0) continue;
    let overlap = 0;
    for (const h of hayTokens) {
      if (needleTokens.some((n) => n.startsWith(h) || h.startsWith(n))) {
        overlap++;
      }
    }
    const score = overlap / hayTokens.length;
    if (score > 0 && (!best || score > best.score)) {
      best = { chapter: c, score };
    }
  }
  return best && best.score >= 0.5 ? best.chapter : null;
}
