/**
 * Browser-only CV text extraction + hashing. Used by `add-candidate-modal.tsx`
 * to prefill the CV9X7R review sub-modal's name/email/phone fields instantly
 * on file selection, before the temp upload even completes -- the server
 * re-derives its own heuristic (and the authoritative hashes) at confirm
 * time regardless, so this is a best-effort UX shortcut, not a source of
 * truth. Hash normalization must match `lib/candidates/cv-hash.ts`'s
 * `cvFileSha256Hex` / `cvContentSha256Hex` exactly.
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
  name: string | null;
};

/** A single line of extracted text with its rendered font size and vertical
 * position, used to guess which line is the candidate's name. */
export type TextLine = {
  text: string;
  /** Largest item height (a direct proxy for font size) on this line. */
  height: number;
  /** PDF user-space y-coordinate (origin bottom-left, increases upward). */
  y: number;
};

const NON_NAME_HEADER_WORDS = /^(curriculum vitae|r[eé]sum[eé]|cv|resume|personal (info|information|details))$/i;

/** Rejects lines that are clearly not a person's name -- contact info,
 * section headers, or anything too short/long to plausibly be a name. */
function looksLikeName(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 60) return false;
  if (/[@]/.test(trimmed)) return false;
  if (/\d/.test(trimmed)) return false;
  if (/https?:\/\/|www\./i.test(trimmed)) return false;
  if (NON_NAME_HEADER_WORDS.test(trimmed)) return false;
  return true;
}

/**
 * Groups raw PDF text items into visual lines (pdf.js splits a single visual
 * line into multiple items on font/style changes; `hasEOL` marks the last
 * item of a line). A line's height is its tallest item -- the biggest
 * font-size run on that line.
 */
export function groupTextItemsIntoLines(
  items: Array<{ str: string; height: number; transform: number[]; hasEOL: boolean }>,
): TextLine[] {
  const lines: TextLine[] = [];
  let bufferText = "";
  let bufferHeight = 0;
  let bufferY: number | null = null;

  const flush = () => {
    if (bufferY !== null && bufferText.trim()) {
      lines.push({ text: bufferText.trim(), height: bufferHeight, y: bufferY });
    }
    bufferText = "";
    bufferHeight = 0;
    bufferY = null;
  };

  for (const item of items) {
    if (bufferY === null) bufferY = item.transform[5];
    bufferText += item.str;
    bufferHeight = Math.max(bufferHeight, item.height);
    if (item.hasEOL) flush();
  }
  flush();

  return lines;
}

/**
 * Picks the most likely "name" line from a page's text lines: the
 * largest-font line within the top half of the page that also passes a
 * sanity filter (not an email/URL/section header). Names are conventionally
 * rendered in the biggest font at the top of a CV.
 */
export function pickLikelyNameLine(lines: TextLine[], pageHeight: number): string | null {
  const topHalfMinY = pageHeight / 2;
  const candidates = lines.filter(
    (line) => line.y >= topHalfMinY && looksLikeName(line.text),
  );
  if (candidates.length === 0) return null;

  const best = candidates.reduce((a, b) => (b.height > a.height ? b : a));
  return best.text;
}

/** DOCX has no font-size metadata once run through `mammoth.extractRawText`,
 * so fall back to the first plausible non-empty line. */
export function guessNameFromPlainText(plainText: string): string | null {
  for (const rawLine of plainText.split("\n")) {
    const line = rawLine.trim();
    if (line && looksLikeName(line)) return line;
  }
  return null;
}

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

type PdfTextItem = { str: string; height: number; transform: number[]; hasEOL: boolean };

/** `page.getTextContent()` returns a `(TextItem | TextMarkedContent)[]` union;
 * only `TextItem` carries `str`/`height`/`transform`/`hasEOL`, so pick those
 * out by hand rather than fighting a type-predicate `.filter()` (the two
 * union members don't share enough shape for `S extends T` to hold). */
function toPdfTextItems(items: unknown[]): PdfTextItem[] {
  const result: PdfTextItem[] = [];
  for (const raw of items) {
    const item = raw as Record<string, unknown>;
    if (
      typeof item.str === "string" &&
      typeof item.height === "number" &&
      Array.isArray(item.transform) &&
      typeof item.hasEOL === "boolean"
    ) {
      result.push({ str: item.str, height: item.height, transform: item.transform, hasEOL: item.hasEOL });
    }
  }
  return result;
}

/** Guesses the candidate's name from page 1's text, using rendered font size
 * as the signal (names are conventionally the biggest text near the top of
 * a CV). Best-effort -- returns `null` on any failure or if nothing plausible
 * is found. */
async function guessNameFromPdfFirstPage(pdf: Awaited<ReturnType<typeof getDocumentProxy>>): Promise<string | null> {
  try {
    const page = await pdf.getPage(1);
    const { items } = await page.getTextContent();
    const textItems = toPdfTextItems(items);
    const lines = groupTextItemsIntoLines(textItems);
    const [, y0, , y1] = page.view;
    return pickLikelyNameLine(lines, y1 - y0);
  } catch {
    return null;
  }
}

async function extractPlainTextAndName(
  arrayBuffer: ArrayBuffer,
  filename: string,
): Promise<{ plainText: string; name: string | null }> {
  const ext = extensionFromFilename(filename);
  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ arrayBuffer });
    const plainText = (result.value ?? "").trim();
    return { plainText, name: guessNameFromPlainText(plainText) };
  }
  const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
  const { text } = await extractText(pdf, { mergePages: true });
  const name = await guessNameFromPdfFirstPage(pdf);
  return { plainText: (text ?? "").trim(), name };
}

export async function extractCvSignalsClientSide(
  file: File,
): Promise<ClientCvSignals> {
  const arrayBuffer = await file.arrayBuffer();
  const cvFileSha256 = await sha256ToHex(arrayBuffer);
  const { plainText, name } = await extractPlainTextAndName(arrayBuffer, file.name);
  const cvContentSha256 = await cvContentSha256Hex(plainText);
  const { email, phone } = extractContactFromText(plainText);

  return { plainText, cvFileSha256, cvContentSha256, email, phone, name };
}
