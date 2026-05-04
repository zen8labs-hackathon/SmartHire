/**
 * Normalized shape for `candidates.parsed_payload` from process-cv / grokParseResume.
 * Kept in sync with supabase/functions/process-cv ParsedResume + safeParseParsedResume.
 */
export type NormalizedParsedResume = {
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  experienceYears: number | null;
  skills: string[];
  degree: string | null;
  school: string | null;
  experienceSummary: string | null;
  englishLevel: string | null;
  gpa: string | null;
};

export function normalizeParsedResume(
  parsedPayload: unknown,
): NormalizedParsedResume {
  if (parsedPayload == null || typeof parsedPayload !== "object") {
    return emptyNormalized();
  }
  const o = parsedPayload as Record<string, unknown>;
  const skillsRaw = o.skills;
  const skills = Array.isArray(skillsRaw)
    ? skillsRaw.filter((s): s is string => typeof s === "string")
    : [];
  const exp = o.experienceYears;
  let experienceYears: number | null = null;
  if (typeof exp === "number" && !Number.isNaN(exp)) experienceYears = exp;
  else if (typeof exp === "string" && exp.trim() !== "") {
    const n = parseFloat(exp);
    if (!Number.isNaN(n)) experienceYears = n;
  }
  const gpaRaw = o.gpa;
  let gpa: string | null = null;
  if (typeof gpaRaw === "number" && Number.isFinite(gpaRaw)) {
    gpa = String(gpaRaw);
  } else if (typeof gpaRaw === "string" && gpaRaw.trim()) {
    gpa = gpaRaw.trim();
  }
  return {
    name: typeof o.name === "string" ? o.name : null,
    email: typeof o.email === "string" ? o.email : null,
    phone: typeof o.phone === "string" ? o.phone : null,
    role: typeof o.role === "string" ? o.role : null,
    experienceYears,
    skills,
    degree: typeof o.degree === "string" ? o.degree : null,
    school: typeof o.school === "string" ? o.school : null,
    experienceSummary:
      typeof o.experienceSummary === "string" ? o.experienceSummary : null,
    englishLevel:
      typeof o.englishLevel === "string" && o.englishLevel.trim()
        ? o.englishLevel.trim()
        : typeof o.english === "string" && o.english.trim()
          ? o.english.trim()
          : null,
    gpa,
  };
}

function emptyNormalized(): NormalizedParsedResume {
  return {
    name: null,
    email: null,
    phone: null,
    role: null,
    experienceYears: null,
    skills: [],
    degree: null,
    school: null,
    experienceSummary: null,
    englishLevel: null,
    gpa: null,
  };
}
