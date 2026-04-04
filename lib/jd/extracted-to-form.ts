import { normalizeFormText } from "@/lib/jd/normalize-text";
import type {
  JdEditFormData,
  JdExtractedFormFields,
  JobDescriptionFormData,
} from "@/lib/jd/types";

const EXTRACT_FIELD_KEYS: (keyof JdExtractedFormFields)[] = [
  "position",
  "department",
  "employment_status",
  "update_note",
  "work_location",
  "reporting",
  "role_overview",
  "duties_and_responsibilities",
  "experience_requirements_must_have",
  "experience_requirements_nice_to_have",
  "what_we_offer",
];

/**
 * Maps API `extracted` JSON into form updates. Omits empty strings so defaults
 * and workflow `status` are preserved unless AI returned a value.
 */
export function extractedApiToFormPatch(
  raw: unknown,
): Partial<JobDescriptionFormData> {
  if (!raw || typeof raw !== "object") return {};
  const e = raw as Record<string, unknown>;

  const candidates: JdExtractedFormFields = {
    position: normalizeFormText(e.position).slice(0, 50),
    department: normalizeFormText(e.department).slice(0, 50),
    employment_status: normalizeFormText(e.employment_status).slice(0, 50),
    update_note: normalizeFormText(e.update_note).slice(0, 50),
    work_location: normalizeFormText(e.work_location).slice(0, 255),
    reporting: normalizeFormText(e.reporting).slice(0, 255),
    role_overview: normalizeFormText(e.role_overview).slice(0, 255),
    duties_and_responsibilities: normalizeFormText(
      e.duties_and_responsibilities,
    ),
    experience_requirements_must_have: normalizeFormText(
      e.experience_requirements_must_have,
    ),
    experience_requirements_nice_to_have: normalizeFormText(
      e.experience_requirements_nice_to_have,
    ),
    what_we_offer: normalizeFormText(e.what_we_offer),
  };

  const patch: Partial<JobDescriptionFormData> = {};
  for (const key of EXTRACT_FIELD_KEYS) {
    const value = candidates[key];
    if (normalizeFormText(value) !== "") {
      patch[key] = value;
    }
  }
  return patch;
}

/**
 * Maps create-form extraction patch into Edit JD intake fields (overlap only).
 * role_overview / work_location / what_we_offer are not on JdEditFormData — omitted here;
 * users can paste those into project_info manually if needed.
 */
export function extractedPatchToEditFormPatch(
  partial: Partial<JobDescriptionFormData>,
): Partial<JdEditFormData> {
  const out: Partial<JdEditFormData> = {};
  if (partial.reporting !== undefined) {
    const v = normalizeFormText(partial.reporting);
    if (v !== "") out.reporting = v;
  }
  if (partial.duties_and_responsibilities !== undefined) {
    const v = normalizeFormText(partial.duties_and_responsibilities);
    if (v !== "") out.duties_and_responsibilities = v;
  }
  if (partial.experience_requirements_must_have !== undefined) {
    const v = normalizeFormText(partial.experience_requirements_must_have);
    if (v !== "") out.experience_requirements_must_have = v;
  }
  if (partial.experience_requirements_nice_to_have !== undefined) {
    const v = normalizeFormText(partial.experience_requirements_nice_to_have);
    if (v !== "") out.experience_requirements_nice_to_have = v;
  }
  return out;
}
