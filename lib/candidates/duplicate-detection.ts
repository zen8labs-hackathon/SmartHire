/**
 * Candidate duplicate detection after CV parse: email, phone (with VN-style
 * variants), raw file SHA-256 (`cv_file_sha256`), and normalized plain-text
 * hash (`cv_content_sha256`).
 */

export type DuplicateMatchedOn =
  | "email"
  | "phone"
  | "email_or_phone"
  | "cv_file"
  | "cv_content";

export type ParsedContact = {
  email: string | null;
  phone: string | null;
  phoneVariants: string[];
};

export type CandidateDedupeRow = {
  id: string;
  name: string | null;
  status: string | null;
  job_opening_id: string | null;
  cv_uploaded_at: string | null;
  created_at: string | null;
  parsed_payload: unknown;
  cv_file_sha256?: string | null;
  cv_content_sha256?: string | null;
};

export type DuplicateCandidateHit = {
  id: string;
  name: string;
  status: string;
  jobOpeningId: string | null;
  cvUploadedAt: string | null;
  matchedOn: DuplicateMatchedOn;
  /** Contact / role from the matched (existing) candidate’s parsed CV payload. */
  email: string | null;
  phone: string | null;
  parsedRole: string | null;
};

/** Snapshot of the newly uploaded row after parse, for duplicate modal comparison. */
export type DuplicateNewUploadPreview = {
  email: string | null;
  phone: string | null;
  parsedRole: string | null;
  cvUploadedAt: string | null;
};

export function roleFromPayload(payload: unknown): string | null {
  const p =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const raw = p.role;
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

export function duplicateNewUploadPreviewFromRow(
  row: CandidateDedupeRow,
): DuplicateNewUploadPreview {
  const contact = parsedContactFromPayload(row.parsed_payload);
  return {
    email: contact.email,
    phone: contact.phone,
    parsedRole: roleFromPayload(row.parsed_payload),
    cvUploadedAt: row.cv_uploaded_at ?? row.created_at ?? null,
  };
}

export function normalizeEmailFromPayload(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  const exactEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : null;
  if (exactEmail) return exactEmail;
  const extracted = raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return extracted?.[0] ?? null;
}

export function normalizePhoneFromPayload(value: unknown): {
  phone: string | null;
  variants: string[];
} {
  if (typeof value !== "string") return { phone: null, variants: [] };
  const compact = value.trim();
  if (!compact) return { phone: null, variants: [] };

  let digits = compact.replace(/\D/g, "");
  if (!digits) return { phone: null, variants: [] };

  if (digits.startsWith("00")) digits = digits.slice(2);

  const variants = new Set<string>();
  variants.add(digits);

  if (digits.startsWith("84") && digits.length >= 10) {
    variants.add(`0${digits.slice(2)}`);
  }
  if (digits.startsWith("0") && digits.length >= 9) {
    variants.add(digits.slice(1));
    variants.add(`84${digits.slice(1)}`);
  }

  if (digits.length >= 9) variants.add(digits.slice(-9));
  if (digits.length >= 10) variants.add(digits.slice(-10));

  return { phone: digits, variants: Array.from(variants).filter(Boolean) };
}

export function parsedContactFromPayload(payload: unknown): ParsedContact {
  const p =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const normalizedPhone = normalizePhoneFromPayload(p.phone);
  return {
    email: normalizeEmailFromPayload(p.email),
    phone: normalizedPhone.phone,
    phoneVariants: normalizedPhone.variants,
  };
}

export function hasPhoneMatch(a: ParsedContact, b: ParsedContact): boolean {
  if (a.phoneVariants.length === 0 || b.phoneVariants.length === 0) return false;
  const bSet = new Set(b.phoneVariants);
  return a.phoneVariants.some((v) => bSet.has(v));
}

/**
 * Priority: email/phone family first, then same raw file bytes, then same extracted text hash.
 */
function matchedOnFromFlags(
  emailMatch: boolean,
  phoneMatch: boolean,
  fileHashMatch: boolean,
  contentHashMatch: boolean,
): DuplicateMatchedOn | null {
  if (emailMatch && phoneMatch) return "email_or_phone";
  if (emailMatch) return "email";
  if (phoneMatch) return "phone";
  if (fileHashMatch) return "cv_file";
  if (contentHashMatch) return "cv_content";
  return null;
}

export function shouldFetchCandidatesForDedupe(current: CandidateDedupeRow): boolean {
  const c = parsedContactFromPayload(current.parsed_payload);
  const contentHash = current.cv_content_sha256?.trim() ?? "";
  const fileHash = current.cv_file_sha256?.trim() ?? "";
  return Boolean(c.email || c.phone || contentHash.length > 0 || fileHash.length > 0);
}

export function findDuplicateCandidateHits(
  current: CandidateDedupeRow,
  others: CandidateDedupeRow[],
): DuplicateCandidateHit[] {
  const currentContact = parsedContactFromPayload(current.parsed_payload);
  const currentContentHash = current.cv_content_sha256?.trim() ?? "";
  const currentFileHash = current.cv_file_sha256?.trim() ?? "";

  return others
    .map((row) => {
      if (String(row.id) === String(current.id)) return null;
      const c = parsedContactFromPayload(row.parsed_payload);
      const otherContentHash = row.cv_content_sha256?.trim() ?? "";
      const otherFileHash = row.cv_file_sha256?.trim() ?? "";

      const emailMatch =
        Boolean(currentContact.email) && currentContact.email === c.email;
      const phoneMatch = hasPhoneMatch(currentContact, c);
      const fileHashMatch =
        currentFileHash.length > 0 &&
        otherFileHash.length > 0 &&
        currentFileHash === otherFileHash;
      const contentHashMatch =
        currentContentHash.length > 0 &&
        otherContentHash.length > 0 &&
        currentContentHash === otherContentHash;

      const matchedOn = matchedOnFromFlags(
        emailMatch,
        phoneMatch,
        fileHashMatch,
        contentHashMatch,
      );
      if (!matchedOn) return null;

      return {
        id: String(row.id),
        name: String(row.name ?? "Unknown"),
        status: String(row.status ?? "New"),
        jobOpeningId: (row.job_opening_id as string | null) ?? null,
        cvUploadedAt:
          (row.cv_uploaded_at as string | null) ??
          (row.created_at as string | null) ??
          null,
        matchedOn,
        email: c.email,
        phone: c.phone,
        parsedRole: roleFromPayload(row.parsed_payload),
      } satisfies DuplicateCandidateHit;
    })
    .filter((row): row is DuplicateCandidateHit => row != null);
}
