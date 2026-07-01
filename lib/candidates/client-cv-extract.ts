/**
 * Browser-only CV text extraction + hashing, used to pre-check duplicates
 * before a file is uploaded to Storage or parsed by the AI. Hash normalization
 * must match `process-cv/index.ts`'s `cvFileSha256Hex` / `cvContentSha256Hex`
 * exactly so client-computed hashes line up with hashes already stored from
 * before this change.
 */

import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

import { extensionFromFilename } from "./upload-constants";
import { extractContactFromText } from "./regex-contact-extraction";

export type ClientCvSignals = {
  plainText: string;
  cvFileSha256: string;
  cvContentSha256: string;
  email: string | null;
  phone: string | null;
};

async function sha256ToHex(data: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function cvContentSha256Hex(plain: string): Promise<string> {
  const normalized = plain
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return sha256ToHex(new TextEncoder().encode(normalized));
}

async function extractPlainText(
  arrayBuffer: ArrayBuffer,
  filename: string,
): Promise<string> {
  const ext = extensionFromFilename(filename);
  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ arrayBuffer });
    return (result.value ?? "").trim();
  }
  const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return (text ?? "").trim();
}

export async function extractCvSignalsClientSide(
  file: File,
): Promise<ClientCvSignals> {
  const arrayBuffer = await file.arrayBuffer();
  const cvFileSha256 = await sha256ToHex(arrayBuffer);
  const plainText = await extractPlainText(arrayBuffer, file.name);
  const cvContentSha256 = await cvContentSha256Hex(plainText);
  const { email, phone } = extractContactFromText(plainText);

  return { plainText, cvFileSha256, cvContentSha256, email, phone };
}
