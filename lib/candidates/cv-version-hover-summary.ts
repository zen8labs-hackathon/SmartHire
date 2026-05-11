import type { CandidateCvPreviousSnapshot } from "@/lib/candidates/cv-history-types";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import type { NormalizedParsedResume } from "@/lib/candidates/normalize-parsed-resume";
import { normalizeParsedResume } from "@/lib/candidates/normalize-parsed-resume";

function skillSet(skills: string[]): Set<string> {
  return new Set(skills.map((s) => s.trim().toLowerCase()).filter(Boolean));
}

function currentSkillsList(
  dbRow: CandidateDbRow,
  activeParsed: NormalizedParsedResume,
): string[] {
  if (dbRow.skills && dbRow.skills.length > 0) return [...dbRow.skills];
  return [...activeParsed.skills];
}

/**
 * Tooltip lines: how the active saved profile differs from an archived CV
 * snapshot (older upload).
 */
export function buildCvVersionHoverSummaryLines(
  snap: CandidateCvPreviousSnapshot | null,
  dbRow: CandidateDbRow,
  activeParsed: NormalizedParsedResume,
): string[] {
  if (!snap) {
    return ["No snapshot stored for this version."];
  }

  const prev = normalizeParsedResume(snap.parsedPayload);
  const currentList = currentSkillsList(dbRow, activeParsed);
  const currSet = skillSet(currentList);
  const prevSet = skillSet(prev.skills);

  const addedKeys = [...currSet].filter((k) => !prevSet.has(k));
  const removedKeys = [...prevSet].filter((k) => !currSet.has(k));

  const resolve = (k: string, list: string[]) =>
    list.find((s) => s.trim().toLowerCase() === k)?.trim() ?? k;

  const lines: string[] = [];

  if (addedKeys.length > 0) {
    const labels = addedKeys.map((k) => resolve(k, currentList));
    const sample = labels.slice(0, 4).join(", ");
    const more =
      labels.length > 4 ? ` (+${labels.length - 4} more)` : "";
    lines.push(
      labels.length === 1
        ? `+1 skill vs this version: ${sample}`
        : `+${labels.length} skills vs this version: ${sample}${more}`,
    );
  }
  if (removedKeys.length > 0) {
    const labels = removedKeys.map((k) => resolve(k, prev.skills));
    const sample = labels.slice(0, 4).join(", ");
    const more =
      labels.length > 4 ? ` (+${labels.length - 4} more)` : "";
    lines.push(
      labels.length === 1
        ? `−1 skill vs this version: ${sample}`
        : `−${labels.length} skills vs this version: ${sample}${more}`,
    );
  }
  if (addedKeys.length === 0 && removedKeys.length === 0 && currSet.size > 0) {
    lines.push("Skill set matches current profile (same tags).");
  }

  const prevPhone = (prev.phone ?? "").trim();
  const currPhone = (activeParsed.phone ?? "").trim();
  if (prevPhone && currPhone && prevPhone !== currPhone) {
    lines.push("Phone differs from this version.");
  } else if (!prevPhone && currPhone) {
    lines.push("Phone added since this version.");
  } else if (prevPhone && !currPhone) {
    lines.push("Phone cleared since this version.");
  }

  const prevEmail = (prev.email ?? "").trim().toLowerCase();
  const currEmail = (activeParsed.email ?? "").trim().toLowerCase();
  if (prevEmail && currEmail && prevEmail !== currEmail) {
    lines.push("Email differs from this version.");
  } else if (!prevEmail && currEmail) {
    lines.push("Email added since this version.");
  } else if (prevEmail && !currEmail) {
    lines.push("Email cleared since this version.");
  }

  const prevRole = (snap.role ?? prev.role ?? "").trim();
  const currRole = (dbRow.role ?? activeParsed.role ?? "").trim();
  if (prevRole && currRole && prevRole !== currRole) {
    lines.push("Job title / role changed since this version.");
  }

  if (lines.length === 0) {
    lines.push("No major parsed field differences detected vs current.");
  }

  return lines;
}
