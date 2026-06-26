/** RFC 9562 UUID v8 (custom/experimental). */
export function newUuidV8(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // Version 8 (bits 4-7 of byte 6)
  bytes[6] = (bytes[6] & 0x0f) | 0x80;

  // Variant 1 (bits 6-7 of byte 8)
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return [
    hexSlice(bytes, 0, 4),
    hexSlice(bytes, 4, 6),
    hexSlice(bytes, 6, 8),
    hexSlice(bytes, 8, 10),
    hexSlice(bytes, 10, 16),
  ].join("-");
}

function hexSlice(bytes: Uint8Array, start: number, end: number): string {
  let hex = "";
  for (let i = start; i < end; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}
