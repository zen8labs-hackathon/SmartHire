/**
 * Browser-only SHA-256 hashing via the Web Crypto API -- called right after
 * the user picks a file, before it's ever sent to the server. Must match
 * `lib/candidates/cv-hash.ts`'s `cvFileSha256Hex` exactly (plain SHA-256 over
 * raw bytes, lowercase hex) so this pre-upload hash always agrees with the
 * one recorded server-side.
 */
export const fileHashService = {
  hashFileBuffer: async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  },
};
