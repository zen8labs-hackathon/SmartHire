import {
  normalizeEmailFromPayload,
  normalizePhoneFromPayload,
} from "@/lib/candidates/duplicate-detection";
import { findCandidatesByContact } from "@/lib/db/candidates";
import type { QueryExecutor } from "@/lib/db/config/client";

/** An existing candidate that already owns the submitted email/phone.
 * `matchedOn` says which signal(s) matched. Shared by the `/candidate-detail`
 * profile-edit dedupe check and the manual-entry pre-create dedupe check. */
export type CandidateDedupeMatch = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  matchedOn: "email" | "phone" | "email_or_phone";
};

/**
 * Looks up existing `candidates` rows matching the given email/phone.
 * `excludeCandidateId` drops one row from the result -- the profile-edit flow
 * uses it to exclude the candidate being edited; the manual-entry flow (no
 * candidate created yet) omits it.
 */
export async function findDuplicateCandidatesByContact(
  db: QueryExecutor,
  contact: { email: string | null; phone: string | null },
  opts: { excludeCandidateId?: string } = {},
): Promise<CandidateDedupeMatch[]> {
  const email = normalizeEmailFromPayload(contact.email);
  const { variants: phoneVariants } = normalizePhoneFromPayload(contact.phone);

  if (!email && phoneVariants.length === 0) return [];

  const rows = (
    await findCandidatesByContact(db, { email, phoneVariants })
  ).filter((row) => row.id !== opts.excludeCandidateId);

  return rows.map((row) => {
    const emailMatch = !!email && row.email?.toLowerCase() === email;
    const rowPhoneDigits = (row.phone ?? "").replace(/\D/g, "");
    const phoneMatch =
      rowPhoneDigits.length > 0 && phoneVariants.includes(rowPhoneDigits);

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      matchedOn:
        emailMatch && phoneMatch
          ? "email_or_phone"
          : emailMatch
            ? "email"
            : "phone",
    } satisfies CandidateDedupeMatch;
  });
}
