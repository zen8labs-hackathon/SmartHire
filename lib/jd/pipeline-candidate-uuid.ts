import { createHash } from "node:crypto";

/**
 * Deterministic UUID per JD pipeline row slot (RFC 4122 variant, version nibble 4).
 * Not UUID v7: v7 is time-based; this must stay stable for the same (jobId, index).
 * Same semantics as former text key `{jobId}-{i}`, typed as uuid for DB/API.
 */
export function pipelineCandidateUuidForSlot(
  jobDescriptionId: string,
  slotIndex: number,
): string {
  const h = createHash("sha256")
    .update(`SmartHire:pipelineCandidate:${jobDescriptionId}:${slotIndex}`, "utf8")
    .digest();
  const bytes = new Uint8Array(16);
  bytes.set(h.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
