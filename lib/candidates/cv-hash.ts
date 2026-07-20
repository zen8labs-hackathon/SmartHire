/**
 * Server-side CV hashing for the post-upload parse step. Normalization must
 * match `lib/candidates/client-cv-extract.ts`'s browser-side algorithm
 * exactly so a hash computed client-side pre-upload (for the duplicate
 * pre-check) always agrees with the hash recomputed here after the file
 * lands in storage.
 */

import { createHash } from "node:crypto";

export function cvFileSha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function cvContentSha256Hex(plain: string): string {
  const normalized = plain
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return createHash("sha256").update(normalized, "utf-8").digest("hex");
}
