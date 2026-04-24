import type { SupabaseClient } from "@supabase/supabase-js";

import { scoreCvAgainstJobDescriptionHybrid } from "@/lib/ai/jd-cv-match";
import { computeJdMatchFormulaAnchor } from "@/lib/candidates/jd-match-formula";
import { resolveJobDescriptionText } from "@/lib/candidates/resolve-job-description-text";

type ParsedPayload = {
  experienceSummary?: string | null;
  email?: string | null;
  phone?: string | null;
};

function buildCvSummary(
  row: {
    name: string | null;
    role: string | null;
    skills: string[] | null;
    degree: string | null;
    school: string | null;
    experience_years: number | string | null;
    parsed_payload: unknown;
  },
): string {
  const p = row.parsed_payload as ParsedPayload | null;
  const skills = (row.skills ?? []).join(", ");
  const parts = [
    row.name && `Name: ${row.name}`,
    row.role && `Current / target role: ${row.role}`,
    row.experience_years != null &&
      row.experience_years !== "" &&
      `Years of experience: ${row.experience_years}`,
    skills && `Skills: ${skills}`,
    row.degree && `Education: ${row.degree}`,
    row.school && `School: ${row.school}`,
    p?.experienceSummary && `Experience summary: ${p.experienceSummary}`,
    p?.email && `Email: ${p.email}`,
    p?.phone && `Phone: ${p.phone}`,
  ].filter(Boolean);
  return parts.join("\n");
}

export type JdMatchRunResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; score: number }
  | { ok: false; error: string };

/**
 * Computes and stores JD match score for a candidate (admin RLS client).
 * Safe to call after CV parsing completes; no-ops or skips when inappropriate.
 */
export async function runJdMatchForCandidate(
  supabase: SupabaseClient,
  candidateId: string,
): Promise<JdMatchRunResult> {
  const { data: row, error: fetchErr } = await supabase
    .from("candidates")
    .select(
      "id, job_opening_id, parsing_status, name, role, skills, degree, school, experience_years, parsed_payload, jd_match_status",
    )
    .eq("id", candidateId)
    .maybeSingle();

  if (fetchErr || !row) {
    return { ok: false, error: fetchErr?.message ?? "Candidate not found" };
  }

  if (row.parsing_status !== "completed") {
    return { ok: true, skipped: true, reason: "parsing_not_complete" };
  }

  if (row.jd_match_status === "processing") {
    return { ok: true, skipped: true, reason: "already_processing" };
  }

  if (row.jd_match_status === "completed") {
    return { ok: true, skipped: true, reason: "already_scored" };
  }

  if (!row.job_opening_id) {
    await supabase
      .from("candidates")
      .update({
        jd_match_status: "skipped",
        jd_match_score: null,
        jd_match_error: null,
        jd_match_rationale: null,
      })
      .eq("id", candidateId);
    return { ok: true, skipped: true, reason: "no_job_opening" };
  }

  const { data: locked, error: lockErr } = await supabase
    .from("candidates")
    .update({ jd_match_status: "processing", jd_match_error: null })
    .eq("id", candidateId)
    .in("jd_match_status", ["pending", "failed", "skipped"])
    .select("id")
    .maybeSingle();

  if (lockErr) {
    return { ok: false, error: lockErr.message };
  }
  if (!locked) {
    return { ok: true, skipped: true, reason: "race_or_state" };
  }

  try {
    const jdText = await resolveJobDescriptionText(
      supabase,
      row.job_opening_id as string,
    );

    if (!jdText?.trim()) {
      await supabase
        .from("candidates")
        .update({
          jd_match_status: "skipped",
          jd_match_score: null,
          jd_match_error: null,
          jd_match_rationale: null,
        })
        .eq("id", candidateId);
      return { ok: true, skipped: true, reason: "no_job_description_text" };
    }

    const cvSummary = buildCvSummary(row);
    if (!cvSummary.trim()) {
      await supabase
        .from("candidates")
        .update({
          jd_match_status: "failed",
          jd_match_error: "No candidate summary available for scoring.",
        })
        .eq("id", candidateId);
      return { ok: false, error: "empty_cv_summary" };
    }

    const formula = computeJdMatchFormulaAnchor({
      jdText,
      cvSummary,
      skills: row.skills,
      role: row.role,
      experienceYears: row.experience_years,
    });

    const { score, rationale } = await scoreCvAgainstJobDescriptionHybrid(
      cvSummary,
      jdText,
      formula,
    );

    const { error: upErr } = await supabase
      .from("candidates")
      .update({
        jd_match_status: "completed",
        jd_match_score: score,
        jd_match_error: null,
        jd_match_rationale: rationale,
      })
      .eq("id", candidateId);

    if (upErr) {
      throw new Error(upErr.message);
    }

    return { ok: true, skipped: false, score };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("candidates")
      .update({
        jd_match_status: "failed",
        jd_match_error: msg.slice(0, 2000),
      })
      .eq("id", candidateId);
    return { ok: false, error: msg };
  }
}
