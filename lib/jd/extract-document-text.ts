import "@/lib/ai/pdf-node-polyfill";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

import { resolveMimeType } from "@/lib/jd/detect-buffer-mime";

const MIN_READABLE_TEXT_LEN = 20;

function bufferToUint8Array(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/** True when "text" is raw PDF object/stream markup instead of human-readable content. */
export function looksLikePdfBinary(text: string): boolean {
  const head = text.slice(0, 4096);
  if (head.startsWith("%PDF-")) return true;
  if (/^\s*\d+\s+\d+\s+obj\b/m.test(head)) return true;
  if (/<<\s*\/Type\s*\/Page\b/.test(head)) return true;
  if (/stream\r?\n/.test(head) && /endstream/.test(head)) return true;
  return false;
}

function isReadableExtractedText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_READABLE_TEXT_LEN) return false;
  if (looksLikePdfBinary(trimmed)) return false;
  return true;
}

async function extractPdfWithUnpdf(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(bufferToUint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return (text ?? "").trim();
}

async function extractPdfWithPdfParse(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text.trim();
  } finally {
    await parser.destroy();
  }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const attempts: string[] = [];

  try {
    const unpdfText = await extractPdfWithUnpdf(buffer);
    if (isReadableExtractedText(unpdfText)) return unpdfText;
    attempts.push("unpdf returned empty or non-readable text");
  } catch (e) {
    attempts.push(
      e instanceof Error ? `unpdf: ${e.message}` : "unpdf failed",
    );
  }

  try {
    const parseText = await extractPdfWithPdfParse(buffer);
    if (isReadableExtractedText(parseText)) return parseText;
    attempts.push("pdf-parse returned empty or non-readable text");
  } catch (e) {
    attempts.push(
      e instanceof Error ? `pdf-parse: ${e.message}` : "pdf-parse failed",
    );
  }

  throw new Error(
    `Could not extract readable text from the PDF. ${attempts.join("; ")}`,
  );
}

/**
 * Extract plain text from an uploaded JD buffer. Never returns raw PDF/DOCX binary
 * disguised as UTF-8 text.
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const resolvedMime = resolveMimeType(buffer, mimeType);

  if (resolvedMime === "application/pdf") {
    return extractPdfText(buffer);
  }

  if (
    resolvedMime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    const trimmed = result.value.trim();
    if (!isReadableExtractedText(trimmed)) {
      throw new Error("Could not extract readable text from the DOCX file.");
    }
    return trimmed;
  }

  const text = buffer.toString("utf-8").trim();
  if (looksLikePdfBinary(text)) {
    throw new Error(
      "File looks like a PDF but could not be parsed. Try re-uploading or use DOCX/TXT.",
    );
  }
  if (!isReadableExtractedText(text)) {
    throw new Error("Could not extract meaningful text from the document.");
  }
  return text;
}
