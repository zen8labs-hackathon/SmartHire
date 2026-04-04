import { readFileSync } from "node:fs";
import { join } from "node:path";

import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument } from "pdf-lib";

/** Canonical repo: googlefonts/noto-fonts redirects to notofonts/noto-fonts. */
const NOTO_REG_MIRRORS = [
  "https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf",
  "https://cdn.jsdelivr.net/gh/notofonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf",
];
const NOTO_BOLD_MIRRORS = [
  "https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Bold.ttf",
  "https://cdn.jsdelivr.net/gh/notofonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Bold.ttf",
];

const FETCH_MS = 25_000;
const MIN_TTF_BYTES = 10_000;

async function fetchWithTimeout(
  url: string,
  ms: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function fetchFontBytes(mirrors: string[]): Promise<Uint8Array | null> {
  for (const url of mirrors) {
    try {
      const res = await fetchWithTimeout(url, FETCH_MS);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength < MIN_TTF_BYTES) continue;
      return new Uint8Array(buf);
    } catch {
      continue;
    }
  }
  return null;
}

async function loadFontBytes(
  localName: string,
  mirrors: string[],
): Promise<Uint8Array | null> {
  const local = join(process.cwd(), "assets", "fonts", localName);
  try {
    const bytes = new Uint8Array(readFileSync(local));
    if (bytes.byteLength >= MIN_TTF_BYTES) return bytes;
  } catch {
    /* fall through to network */
  }
  return fetchFontBytes(mirrors);
}

async function embedTtf(
  doc: PDFDocument,
  bytes: Uint8Array,
): Promise<Awaited<ReturnType<PDFDocument["embedFont"]>>> {
  try {
    return await doc.embedFont(bytes, { subset: true });
  } catch {
    return doc.embedFont(bytes);
  }
}

/**
 * Noto Sans TTF from /assets/fonts (committed in repo), or network mirrors.
 * Embed failures after a successful load are rethrown (not swallowed as “missing font”).
 */
export async function tryEmbedNotoSans(doc: PDFDocument): Promise<{
  regular: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  bold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
} | null> {
  const [regBytes, boldBytes] = await Promise.all([
    loadFontBytes("NotoSans-Regular.ttf", NOTO_REG_MIRRORS),
    loadFontBytes("NotoSans-Bold.ttf", NOTO_BOLD_MIRRORS),
  ]);
  if (!regBytes || !boldBytes) return null;

  doc.registerFontkit(fontkit);

  const [regular, bold] = await Promise.all([
    embedTtf(doc, regBytes),
    embedTtf(doc, boldBytes),
  ]);
  return { regular, bold };
}
