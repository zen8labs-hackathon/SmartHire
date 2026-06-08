/** Infer MIME type from file magic bytes (more reliable than extension alone). */
export function detectMimeFromBuffer(buffer: Buffer): string | null {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "%PDF") {
    return "application/pdf";
  }
  if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return null;
}

export function resolveMimeType(buffer: Buffer, mimeType: string): string {
  return detectMimeFromBuffer(buffer) ?? mimeType;
}
