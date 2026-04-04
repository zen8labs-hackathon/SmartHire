/**
 * pdf-lib StandardFonts (Helvetica, etc.) encode text as WinAnsi / Windows-1252.
 * Unicode outside that set throws, e.g. "WinAnsi cannot encode →".
 */

const LITERAL_REPLACEMENTS: [string, string][] = [
  ["\u2192", "->"],
  ["\u2190", "<-"],
  ["\u2194", "<->"],
  ["\u21d2", "=>"],
  ["\u2014", "--"],
  ["\u2013", "-"],
  ["\u2011", "-"],
  ["\u2012", "-"],
  ["\u2026", "..."],
  ["\u2018", "'"],
  ["\u2019", "'"],
  ["\u201c", '"'],
  ["\u201d", '"'],
  ["\u00ab", '"'],
  ["\u00bb", '"'],
  ["\u2039", "'"],
  ["\u203a", "'"],
  ["\u2022", "*"],
  ["\u00b7", "."],
  ["\u2212", "-"],
  ["\u00d7", "x"],
  ["\u00f7", "/"],
  ["\u202f", " "],
  ["\u00a0", " "],
  ["\ufeff", ""],
  ["\u0111", "d"],
  ["\u0110", "D"],
];

/**
 * Make text safe for pdf-lib `drawText` / `PDFTextField.setText` with StandardFonts.
 */
export function sanitizeForPdfStandardFont(text: string): string {
  let s = text.normalize("NFKC");
  for (const [from, to] of LITERAL_REPLACEMENTS) {
    if (s.includes(from)) s = s.split(from).join(to);
  }
  s = s.normalize("NFD").replace(/\p{M}/gu, "");
  s = s.normalize("NFC");

  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x9 || c === 0xa || c === 0xd) {
      out += s[i];
      continue;
    }
    if (c >= 0x20 && c <= 0x7e) {
      out += s[i];
      continue;
    }
    if (c >= 0xa0 && c <= 0xff) {
      out += s[i];
      continue;
    }
    if (c < 0x20) {
      out += " ";
      continue;
    }
    out += "?";
  }
  return out;
}
