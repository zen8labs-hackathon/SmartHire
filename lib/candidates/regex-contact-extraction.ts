/**
 * Heuristic, regex-only email/phone extraction from raw CV text. Used for the
 * client-side pre-upload duplicate pre-check only — it is not a replacement for
 * the LLM's `grokParseResume` extraction (see `process-cv/index.ts`), which
 * remains the authoritative source once the CV is actually processed.
 */

import { normalizeEmailFromPayload, normalizePhoneFromPayload } from "./duplicate-detection";

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/** VN mobile/landline-shaped runs: optional +84/84/0 prefix, 9-10 digits, common separators. */
const PHONE_RE = /(?:\+?84|0)(?:[\s.-]?\d){8,9}/g;

export type RegexContact = {
  email: string | null;
  phone: string | null;
};

export function extractContactFromText(text: string): RegexContact {
  const emailMatch = text.match(EMAIL_RE)?.[0] ?? null;
  const phoneMatch = text.match(PHONE_RE)?.[0] ?? null;

  return {
    email: emailMatch ? normalizeEmailFromPayload(emailMatch) : null,
    phone: phoneMatch ? normalizePhoneFromPayload(phoneMatch).phone : null,
  };
}
