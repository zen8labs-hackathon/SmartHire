/**
 * Pulls an explicit "N years of experience" figure from resume plain text.
 * Used to verify the model's `experienceYears` claim -- LLMs often invent a
 * number (or confuse nearby integers like "Team size 6") when the CV never
 * states one.
 */
const EXPLICIT_EXPERIENCE_PATTERNS: RegExp[] = [
  /(\d+(?:\.\d+)?)\s*\+?\s*years?\s+(?:of\s+)?(?:professional\s+)?(?:work\s+)?experience\b/i,
  /\bexperience\s*(?:of|:)?\s*(\d+(?:\.\d+)?)\s*\+?\s*years?\b/i,
  /(\d+(?:\.\d+)?)\s*\+?\s*yrs?\s+(?:of\s+)?(?:professional\s+)?(?:work\s+)?experience\b/i,
  /(\d+(?:\.\d+)?)\s*\+?\s*năm(?:\s+kinh\s*nghi[ệe]m)?\b/i,
  /\bkinh\s*nghi[ệe]m\s*(?::|-)?\s*(\d+(?:\.\d+)?)\s*(?:\+?\s*)?năm\b/i,
];

export function explicitExperienceYearsFromText(
  text: string | null | undefined,
): number | null {
  if (!text) return null;

  for (const pattern of EXPLICIT_EXPERIENCE_PATTERNS) {
    const match = pattern.exec(text);
    if (!match?.[1]) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n >= 0 && n <= 60) return n;
  }

  return null;
}
