const EMAIL_RE =
  /^[a-z0-9._%+-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(normalized: string): boolean {
  if (normalized.length < 5 || normalized.length > 254) return false;
  return EMAIL_RE.test(normalized);
}
