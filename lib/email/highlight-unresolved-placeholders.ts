/** Matches the same `{{key}}` shape as `renderEmailTemplate` -- anything
 * still in this shape after rendering means the placeholder was never
 * resolved (typo'd name, or real data missing for this recipient). */
const PLACEHOLDER_PATTERN = /\{\{\s*\w+\s*\}\}/g;

/**
 * Wraps any leftover `{{key}}` placeholder in `html` with a highlight span
 * so a preview makes an unresolved variable obvious at a glance, instead of
 * blending into the surrounding text. Preview rendering only -- never apply
 * this to HTML that will actually be sent; `sendEmail()` must receive
 * exactly what `applyEmailLayout`/`renderEmailTemplate` produced.
 */
export function highlightUnresolvedPlaceholdersHtml(html: string): string {
  return html.replace(
    PLACEHOLDER_PATTERN,
    (match) =>
      `<span class="rounded bg-danger/10 px-0.5 font-semibold text-danger">${match}</span>`,
  );
}
