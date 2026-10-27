/**
 * Pure rules for F1.1 "Open new position" (BR-02-29, D-02-4, D-02-5).
 * Shared by the dialog (browser) and POST /api/admin/job-descriptions (server) so
 * the two cannot drift.
 */

export const POSITION_JD_EXTENSIONS = [".pdf", ".docx"] as const;
export const POSITION_JD_MAX_BYTES = 10 * 1024 * 1024;
export const HEADCOUNT_MIN = 1;
export const HEADCOUNT_MAX = 50;
export const HIRE_TYPES = ["Full-time", "Internship"] as const;
export type PositionHireType = (typeof HIRE_TYPES)[number];
export const DEFAULT_HIRE_TYPE: PositionHireType = "Full-time";
export const BLANK_POSITION_TITLE = "Untitled position";

export const HEADCOUNT_INTEGER_ERROR = "Enter a whole number, 1 or more";
export const HEADCOUNT_MAX_ERROR = "Maximum 50 per position";

export function positionTitleFromFile(filename: string): string {
  return `New position · ${filename}`;
}

export function validateJdFile(file: {
  name: string;
  size: number;
}): string | null {
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  if (!(POSITION_JD_EXTENSIONS as readonly string[]).includes(ext)) {
    return "Unsupported format. Upload a PDF or DOCX file.";
  }
  if (file.size > POSITION_JD_MAX_BYTES) {
    return "File is larger than 10 MB. Upload a smaller file.";
  }
  return null;
}

/** Accepts the raw field text; returns the error to show under the field. */
export function validateHeadcount(raw: string | number): {
  value: number | null;
  error: string | null;
} {
  const text = String(raw).trim();
  if (!/^-?\d+$/.test(text)) {
    return { value: null, error: HEADCOUNT_INTEGER_ERROR };
  }
  const n = Number(text);
  if (n < HEADCOUNT_MIN) return { value: null, error: HEADCOUNT_INTEGER_ERROR };
  if (n > HEADCOUNT_MAX) return { value: null, error: HEADCOUNT_MAX_ERROR };
  return { value: n, error: null };
}

export function isHireType(v: unknown): v is PositionHireType {
  return (HIRE_TYPES as readonly unknown[]).includes(v);
}

/** D-02-4: which controls are live for a given form state. */
export function createPositionState(input: {
  fileValid: boolean;
  headcountValid: boolean;
}) {
  const { fileValid, headcountValid } = input;
  return {
    uploadEnabled: fileValid && headcountValid,
    blankLinkEnabled: headcountValid,
    showHeadcountError: !headcountValid,
  };
}
