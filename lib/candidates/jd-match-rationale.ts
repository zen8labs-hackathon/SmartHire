/**
 * Wire format for `campaign_applied.jd_match_rationale` /
 * `cv_detail_versions.jd_match_rationale`.
 *
 * The column stays `text`, but newer scoring runs store a JSON envelope so the
 * UI can render a per-requirement checklist instead of one opaque paragraph.
 * Rows written before this change (and the formula-only fallbacks in
 * `lib/ai/jd-cv-match.ts`, which have no per-requirement data) hold plain
 * prose -- {@link parseJdMatchRationale} accepts both, so nothing needs a
 * backfill and a rescore is only required to gain the checklist.
 *
 * Client-safe: pure functions, imported by the pipeline modal.
 */

export type JdRequirementVerdict = "met" | "partial" | "missing" | "unclear";

export type JdRequirementSource =
  | "must_have"
  | "nice_to_have"
  | "criteria"
  | "other";

export type JdRequirementCheck = {
  /** The requirement as stated in the JD / evaluation criteria, condensed. */
  requirement: string;
  source: JdRequirementSource;
  verdict: JdRequirementVerdict;
  /** Supporting line from the candidate summary, or why it is not evidenced. */
  evidence: string;
};

export type JdMatchRationale = {
  /** Closing paragraph explaining the score overall. */
  summary: string;
  /** Model / blend footnotes, kept out of `summary` so the UI can de-emphasize them. */
  meta: string;
  requirements: JdRequirementCheck[];
};

type RationaleEnvelope = {
  v: 1;
  summary: string;
  meta: string;
  requirements: JdRequirementCheck[];
};

const VERDICTS: readonly JdRequirementVerdict[] = [
  "met",
  "partial",
  "missing",
  "unclear",
];
const SOURCES: readonly JdRequirementSource[] = [
  "must_have",
  "nice_to_have",
  "criteria",
  "other",
];

/** Generous ceiling; the column is `text`, this only guards runaway output. */
const MAX_ENCODED_LENGTH = 8000;

export function encodeJdMatchRationale(input: {
  summary: string;
  meta: string;
  requirements: JdRequirementCheck[];
}): string {
  const build = (requirements: JdRequirementCheck[]): string =>
    JSON.stringify({
      v: 1,
      summary: input.summary.trim(),
      meta: input.meta.trim(),
      requirements,
    } satisfies RationaleEnvelope);

  /* Truncating the string would corrupt the JSON, so shed whole checks from
     the end instead -- a shorter checklist still parses and renders. */
  let requirements = input.requirements;
  let encoded = build(requirements);
  while (encoded.length > MAX_ENCODED_LENGTH && requirements.length > 0) {
    requirements = requirements.slice(0, -1);
    encoded = build(requirements);
  }
  return encoded;
}

function toRequirement(value: unknown): JdRequirementCheck | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  const requirement = typeof r.requirement === "string" ? r.requirement.trim() : "";
  if (!requirement) return null;

  const verdict = VERDICTS.includes(r.verdict as JdRequirementVerdict)
    ? (r.verdict as JdRequirementVerdict)
    : "unclear";
  const source = SOURCES.includes(r.source as JdRequirementSource)
    ? (r.source as JdRequirementSource)
    : "other";

  return {
    requirement,
    source,
    verdict,
    evidence: typeof r.evidence === "string" ? r.evidence.trim() : "",
  };
}

/**
 * Coerces an untyped list of checks (LLM structured output, or a decoded
 * envelope) into the typed shape, dropping entries that carry no requirement
 * text and defaulting unrecognized enum values.
 */
export function normalizeJdRequirements(value: unknown): JdRequirementCheck[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(toRequirement)
    .filter((r): r is JdRequirementCheck => r !== null);
}

/**
 * Reads either wire format. Plain-prose (legacy / fallback) values come back
 * as `summary` with an empty `requirements`, which is the modal's cue to keep
 * rendering the old single-paragraph layout.
 */
export function parseJdMatchRationale(
  value: string | null | undefined,
): JdMatchRationale | null {
  const text = value?.trim();
  if (!text) return null;

  if (!text.startsWith("{")) {
    return { summary: text, meta: "", requirements: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* Truncated or otherwise non-JSON despite the leading brace. */
    return { summary: text, meta: "", requirements: [] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { summary: text, meta: "", requirements: [] };
  }

  const env = parsed as Record<string, unknown>;
  const requirements = normalizeJdRequirements(env.requirements);

  return {
    summary: typeof env.summary === "string" ? env.summary.trim() : "",
    meta: typeof env.meta === "string" ? env.meta.trim() : "",
    requirements,
  };
}

/** Must-haves and hiring-manager criteria read first; nice-to-haves last. */
const SOURCE_ORDER: Record<JdRequirementSource, number> = {
  criteria: 0,
  must_have: 1,
  other: 2,
  nice_to_have: 3,
};

export function sortJdRequirements(
  requirements: JdRequirementCheck[],
): JdRequirementCheck[] {
  return [...requirements].sort(
    (a, b) => SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source],
  );
}

export function jdRequirementVerdictStyle(verdict: JdRequirementVerdict): {
  icon: string;
  label: string;
  color: "success" | "warning" | "danger" | "default";
} {
  switch (verdict) {
    case "met":
      return { icon: "✓", label: "Met", color: "success" };
    case "partial":
      return { icon: "~", label: "Partial", color: "warning" };
    case "missing":
      return { icon: "✕", label: "Missing", color: "danger" };
    case "unclear":
    default:
      return { icon: "?", label: "Unclear", color: "default" };
  }
}

export function jdRequirementSourceLabel(source: JdRequirementSource): string {
  switch (source) {
    case "must_have":
      return "Must-have";
    case "nice_to_have":
      return "Nice-to-have";
    case "criteria":
      return "Criteria";
    case "other":
    default:
      return "Other";
  }
}
