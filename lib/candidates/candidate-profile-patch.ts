import { z } from "zod";

import { CANDIDATE_SOURCE_VALUES } from "@/lib/candidates/source-constants";

export const PROFILE_NAME_MAX = 200;
export const PROFILE_ROLE_MAX = 300;
export const PROFILE_DEGREE_SCHOOL_MAX = 200;
export const PROFILE_SOURCE_OTHER_MAX = 500;
export const PROFILE_EMAIL_MAX = 320;
export const PROFILE_PHONE_MAX = 40;
export const MAX_SKILLS = 40;
export const MAX_SKILL_LEN = 80;
export const EXPERIENCE_YEARS_MAX = 80;

function optionalTrimmedNullable(maxLen: number) {
  return z
    .union([z.string().max(maxLen), z.null()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      const t = v.trim();
      return t.length === 0 ? null : t;
    });
}

const optionalSkills = z
  .array(z.string().max(MAX_SKILL_LEN))
  .max(MAX_SKILLS)
  .optional()
  .transform((arr) => {
    if (arr === undefined) return undefined;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of arr) {
      const t = s.trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
      if (out.length >= MAX_SKILLS) break;
    }
    return out;
  });

export const candidateProfilePatchSchema = z
  .object({
    name: optionalTrimmedNullable(PROFILE_NAME_MAX),
    role: optionalTrimmedNullable(PROFILE_ROLE_MAX),
    degree: optionalTrimmedNullable(PROFILE_DEGREE_SCHOOL_MAX),
    school: optionalTrimmedNullable(PROFILE_DEGREE_SCHOOL_MAX),
    experience_years: z
      .number()
      .min(0)
      .max(EXPERIENCE_YEARS_MAX)
      .optional(),
    skills: optionalSkills,
    source: z.enum(CANDIDATE_SOURCE_VALUES).optional(),
    source_other: optionalTrimmedNullable(PROFILE_SOURCE_OTHER_MAX),
    email: optionalTrimmedNullable(PROFILE_EMAIL_MAX),
    phone: optionalTrimmedNullable(PROFILE_PHONE_MAX),
  })
  .strict()
  .superRefine((val, ctx) => {
    const count = Object.values(val).filter((v) => v !== undefined).length;
    if (count === 0) {
      ctx.addIssue({
        code: "custom",
        message: "At least one field is required.",
        path: [],
      });
    }
    if (val.source_other !== undefined) {
      const so = val.source_other;
      if (so !== null && so.trim() === "") {
        ctx.addIssue({
          code: "custom",
          message: "source_other cannot be blank; use null to clear.",
          path: ["source_other"],
        });
      }
    }
  });

export type CandidateProfilePatchInput = z.infer<
  typeof candidateProfilePatchSchema
>;

export type ProfileMergeFields = {
  name?: string | null;
  role?: string | null;
  experienceYears?: number | null;
  skills?: string[];
  degree?: string | null;
  school?: string | null;
  email?: string | null;
  phone?: string | null;
};

/**
 * Merges editable resume fields into `parsed_payload` so UI and CV comparison
 * stay aligned with denormalized columns on `candidates`.
 */
export function mergeProfileIntoParsedPayload(
  existingPayload: unknown,
  profile: ProfileMergeFields,
): Record<string, unknown> {
  const base =
    existingPayload != null &&
    typeof existingPayload === "object" &&
    !Array.isArray(existingPayload)
      ? { ...(existingPayload as Record<string, unknown>) }
      : {};
  if (profile.name !== undefined) base.name = profile.name;
  if (profile.role !== undefined) base.role = profile.role;
  if (profile.experienceYears !== undefined) {
    base.experienceYears = profile.experienceYears;
  }
  if (profile.skills !== undefined) base.skills = profile.skills;
  if (profile.degree !== undefined) base.degree = profile.degree;
  if (profile.school !== undefined) base.school = profile.school;
  if (profile.email !== undefined) base.email = profile.email;
  if (profile.phone !== undefined) base.phone = profile.phone;
  return base;
}

/** Parsed form state for comparing before/after edits. */
export type CandidateProfileFormSnapshot = {
  name: string;
  role: string;
  experienceYears: number;
  skills: string[];
  degree: string;
  school: string;
  source: (typeof CANDIDATE_SOURCE_VALUES)[number];
  sourceOther: string;
  email: string;
  phone: string;
};

function sortedSkillKey(skills: string[]): string {
  return [...skills].map((s) => s.toLowerCase()).sort().join("\u0000");
}

/**
 * Builds a minimal PATCH body from form state vs baseline. Returns null when
 * nothing changed (caller should not call the API).
 */
export function diffProfileSnapshotsToPatch(
  current: CandidateProfileFormSnapshot,
  baseline: CandidateProfileFormSnapshot,
): Partial<CandidateProfilePatchInput> | null {
  const patch: Partial<CandidateProfilePatchInput> = {};

  const name = current.name.trim();
  if (name !== baseline.name.trim()) {
    patch.name = name.length === 0 ? null : name;
  }

  const role = current.role.trim();
  if (role !== baseline.role.trim()) {
    patch.role = role.length === 0 ? null : role;
  }

  if (current.experienceYears !== baseline.experienceYears) {
    patch.experience_years = current.experienceYears;
  }

  if (sortedSkillKey(current.skills) !== sortedSkillKey(baseline.skills)) {
    patch.skills = current.skills;
  }

  const degree = current.degree.trim();
  if (degree !== baseline.degree.trim()) {
    patch.degree = degree.length === 0 ? null : degree;
  }

  const school = current.school.trim();
  if (school !== baseline.school.trim()) {
    patch.school = school.length === 0 ? null : school;
  }

  if (current.source !== baseline.source) {
    patch.source = current.source;
    if (current.source === "Other") {
      patch.source_other = current.sourceOther.trim();
    }
  } else if (
    current.source === "Other" &&
    current.sourceOther.trim() !== baseline.sourceOther.trim()
  ) {
    patch.source_other = current.sourceOther.trim();
  }

  const email = current.email.trim();
  if (email !== baseline.email.trim()) {
    patch.email = email.length === 0 ? null : email;
  }

  const phone = current.phone.trim();
  if (phone !== baseline.phone.trim()) {
    patch.phone = phone.length === 0 ? null : phone;
  }

  if (Object.keys(patch).length === 0) return null;
  return patch;
}

export function patchInputToMergeFields(
  patch: CandidateProfilePatchInput,
): ProfileMergeFields {
  const out: ProfileMergeFields = {};
  if (patch.name !== undefined) out.name = patch.name;
  if (patch.role !== undefined) out.role = patch.role;
  if (patch.degree !== undefined) out.degree = patch.degree;
  if (patch.school !== undefined) out.school = patch.school;
  if (patch.experience_years !== undefined) {
    out.experienceYears = patch.experience_years;
  }
  if (patch.skills !== undefined) out.skills = patch.skills;
  if (patch.email !== undefined) out.email = patch.email;
  if (patch.phone !== undefined) out.phone = patch.phone;
  return out;
}
