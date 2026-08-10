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
