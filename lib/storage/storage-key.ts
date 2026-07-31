const MAX_LABEL_LENGTH = 80;

/**
 * Strips accents and any character unsafe/awkward in an S3 key, keeping the
 * result human-readable (unlike a bare UUID) when browsing the bucket.
 */
export function sanitizeForStorageKey(label: string): string {
  const cleaned = label
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "") // combining accent marks left behind by NFD
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "")
    .slice(0, MAX_LABEL_LENGTH);
  return cleaned || "file";
}

/** Short random suffix so two uploads sharing a label don't collide. */
export function randomKeySuffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

/**
 * Builds a human-readable S3 filename: `{sanitized-label}_{shortId}{ext}`.
 * `label` should already have its extension stripped.
 */
export function buildStorageFilename(label: string, ext: string): string {
  return `${sanitizeForStorageKey(label)}_${randomKeySuffix()}${ext}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** `ddMMyyyyHHmmss` timestamp (server local time). */
export function formatStorageTimestamp(date: Date = new Date()): string {
  return (
    pad2(date.getDate()) +
    pad2(date.getMonth() + 1) +
    String(date.getFullYear()) +
    pad2(date.getHours()) +
    pad2(date.getMinutes()) +
    pad2(date.getSeconds())
  );
}

/**
 * Builds a timestamp-prefixed S3 filename: `{ddMMyyyyHHmmss}_{sanitized-label}{ext}`.
 * `label` should already have its extension stripped.
 */
export function buildTimestampedStorageFilename(
  label: string,
  ext: string,
  date: Date = new Date(),
): string {
  return `${formatStorageTimestamp(date)}_${sanitizeForStorageKey(label)}${ext}`;
}
