/**
 * Deterministic anchor score for JD ↔ CV fit (EzPassed-style baseline).
 * Blended with the LLM score in jd-cv-match; see ai-ezpassed-main GapAnalyzer._calculate_fit_score.
 */

const DEFAULT_AI_WEIGHT = 0.65;

/** Neutral sub-scores when we cannot infer that dimension from text. */
const NEUTRAL_SKILL = 55;
const NEUTRAL_EXPERIENCE = 72;

const STOPWORDS = new Set([
  "the",
  "and",
  "or",
  "for",
  "with",
  "from",
  "this",
  "that",
  "will",
  "have",
  "has",
  "are",
  "our",
  "you",
  "your",
  "all",
  "any",
  "not",
  "but",
  "can",
  "may",
  "must",
  "work",
  "team",
  "role",
  "job",
  "years",
  "year",
  "experience",
]);

export type JdMatchFormulaResult = {
  /** 0–100 composite used as the formula anchor. */
  score: number;
  /** Short HR-readable summary for optional appending to rationale. */
  summary: string;
  breakdown: {
    skillSubscore: number;
    experienceSubscore: number;
    requiredYearsInferred: number | null;
    jdHintCount: number;
    matchedHints: number;
    candidateSkillsMatchedInJd: number;
    candidateSkillCount: number;
  };
};

function normalizePhrase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[._]/g, "")
    .trim();
}

const SECTION_LABEL =
  /(experience\s+requirements|must-?have|nice-?to-?have|requirements|skills?|technologies|tech\s+stack|qualifications|key\s+skills)/i;

/**
 * Heuristic: pull comma/semicolon-separated chunks from JD lines that look like requirement lists.
 */
export function extractJdSkillHints(jdText: string): string[] {
  const hints = new Set<string>();
  const lines = jdText.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.length < 4) continue;

    let payload: string | null = null;
    if (SECTION_LABEL.test(line) && line.includes(":")) {
      payload = line.slice(line.indexOf(":") + 1).trim();
    } else if (i > 0 && SECTION_LABEL.test(lines[i - 1]!.trim()) && !lines[i - 1]!.includes(":")) {
      /* Header line without ":", body on next line */
      payload = line;
    }

    if (!payload || payload.length < 3) continue;

    const parts = payload.split(/[,;/|•·]/);
    for (const p of parts) {
      const t = p.replace(/^[\s\-–—•·]+/, "").trim();
      if (t.length < 2 || t.length > 80) continue;
      const low = t.toLowerCase();
      if (STOPWORDS.has(low)) continue;
      hints.add(normalizePhrase(t));
    }
  }

  return [...hints].slice(0, 80);
}

function candidateBlob(skills: string[], cvSummary: string, role: string | null): string {
  const parts = [
    ...skills.map((s) => s.trim()).filter(Boolean),
    role?.trim() ?? "",
    cvSummary,
  ];
  return normalizePhrase(parts.join(" "));
}

function phraseInBlob(blobNorm: string, phraseNorm: string): boolean {
  if (!phraseNorm || phraseNorm.length < 2) return false;
  if (blobNorm.includes(phraseNorm)) return true;
  /* Word-ish tokens: avoid "go" matching "negotiation" */
  if (/^[a-z0-9+#]+$/i.test(phraseNorm) && phraseNorm.length <= 3) {
    const re = new RegExp(
      `(?:^|[^a-z0-9#+])${escapeRegExp(phraseNorm)}(?:$|[^a-z0-9#+])`,
      "i",
    );
    return re.test(` ${blobNorm} `);
  }
  return blobNorm.includes(phraseNorm);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Count candidate skills whose text appears in the JD (candidate brings skill JD mentions). */
function skillsMentionedInJd(
  skills: string[],
  jdLowerNorm: string,
): { matched: number; total: number } {
  const list = skills.map((s) => normalizePhrase(s)).filter((s) => s.length > 0);
  if (list.length === 0) return { matched: 0, total: 0 };
  let m = 0;
  for (const s of list) {
    if (phraseInBlob(jdLowerNorm, s)) m += 1;
  }
  return { matched: m, total: list.length };
}

/**
 * Match extracted JD hints against full candidate text (skills + summary + role).
 */
function hintCoverage(
  hints: string[],
  candidateNorm: string,
): { matched: number; total: number } {
  if (hints.length === 0) return { matched: 0, total: 0 };
  let m = 0;
  for (const h of hints) {
    if (phraseInBlob(candidateNorm, h)) m += 1;
  }
  return { matched: m, total: hints.length };
}

export function parseRequiredYearsFromJd(jdText: string): number | null {
  const t = jdText.slice(0, 24_000);
  const candidates: number[] = [];

  const reRange = /(\d+)\s*[-–]\s*(\d+)\s+years?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = reRange.exec(t)) !== null) {
    candidates.push(Math.max(Number(m[1]), Number(m[2])));
  }

  const rePlus = /(\d+)\s*\+\s*years?\b/gi;
  while ((m = rePlus.exec(t)) !== null) {
    candidates.push(Number(m[1]));
  }

  const rePlain = /\b(?:at\s+least|minimum|min\.?)\s+(\d+)\s+years?\b/gi;
  while ((m = rePlain.exec(t)) !== null) {
    candidates.push(Number(m[1]));
  }

  const reOf = /(\d+)\s+years?\s+(?:of\s+)?experience\b/gi;
  while ((m = reOf.exec(t)) !== null) {
    candidates.push(Number(m[1]));
  }

  const filtered = candidates.filter((n) => Number.isFinite(n) && n >= 0 && n <= 40);
  if (filtered.length === 0) return null;
  return Math.max(...filtered);
}

function experienceMatchScore(
  candidateYears: number,
  requiredYears: number | null,
): number {
  if (requiredYears == null) return NEUTRAL_EXPERIENCE;
  if (candidateYears >= requiredYears) return 100;
  const gap = requiredYears - candidateYears;
  return Math.max(0, 100 - gap * 12);
}

/**
 * Composite formula score 0–100 (skills + experience), plus breakdown for logging/rationale.
 */
export function computeJdMatchFormulaAnchor(input: {
  jdText: string;
  cvSummary: string;
  skills: string[] | null;
  role: string | null;
  experienceYears: number | string | null;
}): JdMatchFormulaResult {
  const jdNorm = normalizePhrase(input.jdText.slice(0, 24_000));
  const skillsList = (input.skills ?? []).filter((s) => typeof s === "string" && s.trim());
  const expRaw = input.experienceYears;
  const candidateYears =
    expRaw == null || expRaw === ""
      ? 0
      : Math.min(40, Math.max(0, Number(expRaw)));

  const hints = extractJdSkillHints(input.jdText);
  const candBlob = candidateBlob(skillsList, input.cvSummary, input.role);

  const { matched: inJd, total: skillTotal } = skillsMentionedInJd(skillsList, jdNorm);
  const skillFromList =
    skillTotal === 0 ? NEUTRAL_SKILL : Math.round((inJd / skillTotal) * 100);

  const { matched: mh, total: ht } = hintCoverage(hints, candBlob);
  const skillFromHints =
    ht === 0 ? NEUTRAL_SKILL : Math.round((mh / ht) * 100);

  /* When both signals exist, average; else use the available one. */
  let skillSubscore: number;
  if (ht === 0 && skillTotal === 0) {
    skillSubscore = NEUTRAL_SKILL;
  } else if (ht === 0) {
    skillSubscore = skillFromList;
  } else if (skillTotal === 0) {
    skillSubscore = skillFromHints;
  } else {
    skillSubscore = Math.round((skillFromHints + skillFromList) / 2);
  }

  const requiredYears = parseRequiredYearsFromJd(input.jdText);
  const experienceSubscore = experienceMatchScore(candidateYears, requiredYears);

  /* EzPassed-style 50/30/20 without certs → 55% skills, 45% experience within anchor. */
  const score = Math.round(skillSubscore * 0.55 + experienceSubscore * 0.45);
  const clamped = Math.min(100, Math.max(0, score));

  const parts: string[] = [];
  parts.push(`checklist ~${skillSubscore}%`);
  if (requiredYears != null) {
    parts.push(`exp vs ~${requiredYears}yr req ~${experienceSubscore}%`);
  } else {
    parts.push(`exp neutral`);
  }

  return {
    score: clamped,
    summary: `Formula anchor (${parts.join(", ")}).`,
    breakdown: {
      skillSubscore,
      experienceSubscore,
      requiredYearsInferred: requiredYears,
      jdHintCount: hints.length,
      matchedHints: mh,
      candidateSkillsMatchedInJd: inJd,
      candidateSkillCount: skillTotal,
    },
  };
}

export function blendAiAndFormulaScores(aiScore: number, formulaScore: number): number {
  const w = aiWeightFromEnv();
  const ai = Math.min(100, Math.max(0, Math.round(aiScore)));
  const f = Math.min(100, Math.max(0, Math.round(formulaScore)));
  return Math.round(w * ai + (1 - w) * f);
}

export function aiWeightFromEnv(): number {
  const raw = process.env.JD_MATCH_AI_WEIGHT?.trim();
  if (!raw) return DEFAULT_AI_WEIGHT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return DEFAULT_AI_WEIGHT;
  return n;
}
