export type EmailTemplateVariables = Record<string, string>;

/**
 * Substitutes `{{key}}` placeholders from `vars`. An unknown placeholder is
 * left as-is (rather than blanked) so a typo or a not-yet-populated variable
 * (e.g. `{{interview_date}}` on a non-interview trigger) is visible in the
 * preview instead of silently disappearing.
 */
export function renderEmailTemplate(
  template: string,
  vars: EmailTemplateVariables,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match,
  );
}

export function renderEmailSubjectAndBody(
  subjectTemplate: string,
  bodyTemplate: string,
  vars: EmailTemplateVariables,
): { subject: string; bodyHtml: string } {
  return {
    subject: renderEmailTemplate(subjectTemplate, vars),
    bodyHtml: renderEmailTemplate(bodyTemplate, vars),
  };
}

/**
 * Returns every distinct `{{key}}` placeholder still present in `text` --
 * i.e. one `renderEmailTemplate` never resolved (typo'd placeholder name, or
 * real per-recipient data that's missing). Used to block a send that would
 * otherwise deliver literal, unrendered `{{...}}` text to a real recipient --
 * see `findUnresolvedPlaceholders` call sites in the send routes and
 * auto-send-for-trigger.ts.
 */
export function findUnresolvedPlaceholders(text: string): string[] {
  const matches = text.match(/\{\{\s*\w+\s*\}\}/g) ?? [];
  return [...new Set(matches)];
}
