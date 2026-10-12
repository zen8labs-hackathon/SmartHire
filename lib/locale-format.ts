/**
 * Locale-aware formatting and text normalisation (UX-09).
 * Supported UI locales: vi, en, ja.
 */
export type UiLocale = "vi" | "en" | "ja";

const INTL_TAG: Record<UiLocale, string> = {
  vi: "vi-VN",
  en: "en-US",
  ja: "ja-JP",
};

/** Normalise to NFC so Vietnamese diacritics compare and search consistently. */
export function toNfc(value: string): string {
  return value.normalize("NFC");
}

/** NFC + case-fold + trim, for storing search keys and matching queries. */
export function searchKey(value: string): string {
  return toNfc(value).trim().toLocaleLowerCase();
}

export function formatNumber(
  value: number,
  locale: UiLocale = "en",
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(INTL_TAG[locale], options).format(value);
}

export function formatDate(
  value: Date | string | number,
  locale: UiLocale = "en",
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit" },
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(INTL_TAG[locale], options).format(d);
}
