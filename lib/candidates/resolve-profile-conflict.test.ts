import { beforeEach, describe, expect, it, vi } from "vitest";

// `resolveProfileConflict` opens its own transaction via `withTransaction`
// (real implementation checks out a Postgres client from the pool) -- mocked
// here to just hand the callback an in-memory fake so these tests never
// touch a real database.
vi.mock("@/lib/db/config/client", () => ({
  withTransaction: async (fn: (tx: unknown) => unknown) => fn(fakeTx),
}));

import { resolveProfileConflict } from "./resolve-profile-conflict";
import { candidateProfilePatchSchema } from "./candidate-profile-patch";

/** Builds a real, fully-typed patch the same way the API route does (`schema.parse`), instead of hand-writing object literals that don't match the schema's inferred output shape. */
function patch(input: Record<string, unknown>) {
  return candidateProfilePatchSchema.parse(input);
}

type Row = Record<string, unknown>;

/**
 * Minimal in-memory stand-in for the Postgres tables `resolveProfileConflict`
 * and its dependencies (`getCampaignAppliedById`, `getCandidateById`,
 * `findCandidatesByDedupeSignals`, `mergeDuplicateApplicationIntoExisting`,
 * `linkApplicationToExistingCandidate`, `applyManualProfileEdit`,
 * `syncCandidateAggregateFields`, ...) touch. Dispatches on the shape of the
 * SQL text rather than call order/count, so it stays robust to incidental
 * reordering inside those functions.
 */
class FakeTx {
  candidates = new Map<string, Row>();
  campaignApplied = new Map<string, Row>();
  cvVersions = new Map<string, Row>();
  calls: Array<{ sql: string; values: unknown[] }> = [];
  private nextCvId = 1;
  /** Set by a test to make the next matching query throw a Postgres-shaped unique-violation error. */
  throwUniqueViolationOn?: (sql: string) => boolean;

  seedCandidate(row: Row) {
    this.candidates.set(row.id as string, { deleted_at: null, ...row });
  }
  seedApplication(row: Row) {
    this.campaignApplied.set(row.id as string, { deleted_at: null, ...row });
  }
  seedCvVersion(row: Row) {
    this.cvVersions.set(row.id as string, row);
  }

  writeCallCount(): number {
    return this.calls.filter((c) =>
      /^(INSERT|UPDATE|DELETE)/i.test(c.sql.trim()),
    ).length;
  }

  query = async (rawSql: string, values: unknown[] = []): Promise<{ rows: Row[] }> => {
    const sql = rawSql.replace(/\s+/g, " ").trim();
    this.calls.push({ sql: rawSql, values });

    if (this.throwUniqueViolationOn?.(sql)) {
      const err = new Error("duplicate key value violates unique constraint");
      (err as unknown as { code: string }).code = "23505";
      throw err;
    }

    if (sql.startsWith("SELECT id FROM candidates WHERE id = ANY($1::uuid[])")) {
      const ids = values[0] as string[];
      const rows = ids
        .filter((id) => {
          const c = this.candidates.get(id);
          return c && !c.deleted_at;
        })
        .sort()
        .map((id) => ({ id }));
      return { rows };
    }

    if (sql.startsWith("SELECT id FROM campaign_applied WHERE id = $1 FOR UPDATE")) {
      const row = this.campaignApplied.get(values[0] as string);
      return { rows: row ? [{ id: row.id }] : [] };
    }

    if (sql.startsWith("SELECT * FROM campaign_applied WHERE id = $1 AND deleted_at IS NULL")) {
      const row = this.campaignApplied.get(values[0] as string);
      return { rows: row && !row.deleted_at ? [{ ...row }] : [] };
    }

    if (
      sql.startsWith(
        "SELECT * FROM campaign_applied WHERE candidate_id = $1 AND job_id = $2 AND deleted_at IS NULL",
      )
    ) {
      const [candidateId, jobId] = values as [string, string];
      for (const row of this.campaignApplied.values()) {
        if (!row.deleted_at && row.candidate_id === candidateId && row.job_id === jobId) {
          return { rows: [{ ...row }] };
        }
      }
      return { rows: [] };
    }

    if (sql.startsWith("SELECT * FROM candidates WHERE id = $1 AND deleted_at IS NULL")) {
      const row = this.candidates.get(values[0] as string);
      return { rows: row && !row.deleted_at ? [{ ...row }] : [] };
    }

    if (sql.startsWith("SELECT * FROM cv_detail_versions WHERE id = $1")) {
      const row = this.cvVersions.get(values[0] as string);
      return { rows: row ? [{ ...row }] : [] };
    }

    // findCandidatesByDedupeSignals
    if (sql.startsWith("SELECT c.id AS candidate_id")) {
      const [email, phoneVariants, , , excludeId] = values as [
        string | null,
        string[] | null,
        string | null,
        string | null,
        string | undefined,
      ];
      const rows: Row[] = [];
      for (const ca of this.campaignApplied.values()) {
        if (ca.deleted_at) continue;
        if (excludeId && ca.id === excludeId) continue;
        const c = this.candidates.get(ca.candidate_id as string);
        if (!c || c.deleted_at) continue;
        const emailHit =
          !!email && typeof c.email === "string" && c.email.toLowerCase() === email;
        // Mirrors the real query's `regexp_replace(c.phone, '\D', '', 'g')`:
        // `candidates.phone` may be stored raw/formatted, so strip
        // non-digits before comparing against the digit-only variants.
        const phoneHit =
          !!phoneVariants &&
          typeof c.phone === "string" &&
          phoneVariants.includes(c.phone.replace(/\D/g, ""));
        if (emailHit || phoneHit) {
          rows.push({
            candidate_id: c.id,
            candidate_name: c.name ?? null,
            candidate_email: c.email ?? null,
            candidate_phone: c.phone ?? null,
            campaign_applied_id: ca.id,
            job_id: ca.job_id ?? null,
          });
        }
      }
      return { rows };
    }

    if (sql.startsWith("SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version")) {
      const campaignAppliedId = values[0] as string;
      let max = 0;
      for (const cv of this.cvVersions.values()) {
        if (cv.campaign_applied_id === campaignAppliedId) {
          max = Math.max(max, cv.version_number as number);
        }
      }
      return { rows: [{ next_version: max + 1 }] };
    }

    if (sql.startsWith("INSERT INTO cv_detail_versions")) {
      const id = `cv-new-${this.nextCvId++}`;
      const row: Row = {
        id,
        campaign_applied_id: values[0],
        version_number: values[1],
        source_event: values[2],
        cv_storage_path: values[3],
        original_filename: values[4],
        mime_type: values[5],
        cv_file_sha256: values[6],
        cv_content_sha256: values[7],
        parsing_status: values[8],
        parsing_error: values[9],
        parsed_payload: values[10] != null ? JSON.parse(values[10] as string) : null,
        skills: values[11] ?? [],
        role: values[12] ?? null,
        degree: values[13] ?? null,
        education: values[14] ?? null,
        experience_years: values[15] != null ? String(values[15]) : null,
        gpa: values[16] ?? null,
        english_level: values[17] ?? null,
        date_of_birth: values[18] ?? null,
        student_years: values[19] ?? null,
        matched_on: values[20] ?? null,
        change_summary: values[21] ?? null,
        created_by: values[22] ?? null,
        created_at: new Date(),
      };
      this.cvVersions.set(id, row);
      return { rows: [row] };
    }

    if (sql.startsWith("UPDATE campaign_applied SET candidate_id = $2")) {
      const [id, candidateId] = values as [string, string];
      const row = this.campaignApplied.get(id);
      if (row) row.candidate_id = candidateId;
      return { rows: [] };
    }

    // Generic `UPDATE campaign_applied SET col = $N, ... , updated_at = now() WHERE id = $1 ...`
    // built by `buildSetClause` (updateCampaignApplied) -- parse the clause
    // instead of hardcoding a field combination, since callers vary.
    const caUpdateMatch = sql.match(
      /^UPDATE campaign_applied SET (.+?), updated_at = now\(\) WHERE id = \$1/,
    );
    if (caUpdateMatch) {
      const id = values[0] as string;
      const row = this.campaignApplied.get(id);
      if (row) {
        for (const assignment of caUpdateMatch[1].split(", ")) {
          const m = assignment.match(/^(\w+) = \$(\d+)$/);
          if (!m) continue;
          row[m[1]] = values[Number(m[2]) - 1];
        }
      }
      return { rows: row ? [{ ...row }] : [] };
    }

    if (sql.startsWith("DELETE FROM campaign_applied WHERE id = $1")) {
      this.campaignApplied.delete(values[0] as string);
      return { rows: [] };
    }

    if (sql.startsWith("DELETE FROM candidates")) {
      const id = values[0] as string;
      const hasOther = [...this.campaignApplied.values()].some(
        (ca) => !ca.deleted_at && ca.candidate_id === id,
      );
      if (!hasOther) this.candidates.delete(id);
      return { rows: [] };
    }

    // syncCandidateAggregateFields SELECT
    if (sql.startsWith("SELECT cv.skills, cv.experience_years")) {
      const candidateId = values[0] as string;
      const rows: Row[] = [];
      for (const ca of this.campaignApplied.values()) {
        if (ca.deleted_at || ca.candidate_id !== candidateId) continue;
        const cv = ca.active_cv_version_id
          ? this.cvVersions.get(ca.active_cv_version_id as string)
          : null;
        if (cv) rows.push(cv);
      }
      return { rows };
    }

    // updateCandidate (applyManualProfileEdit's direct name/email/phone
    // write) -- a plain `col = $N, ...` list ending in `RETURNING *`, unlike
    // syncCandidateAggregateFields's fixed COALESCE-based shape below.
    const candidateUpdateMatch = sql.match(
      /^UPDATE candidates SET (.+?), updated_at = now\(\) WHERE id = \$1 AND deleted_at IS NULL RETURNING \*$/,
    );
    if (candidateUpdateMatch) {
      const id = values[0] as string;
      const row = this.candidates.get(id);
      if (row) {
        for (const assignment of candidateUpdateMatch[1].split(", ")) {
          const m = assignment.match(/^(\w+) = \$(\d+)$/);
          if (!m) continue;
          row[m[1]] = values[Number(m[2]) - 1];
        }
      }
      return { rows: row ? [{ ...row }] : [] };
    }

    // syncCandidateAggregateFields UPDATE
    if (sql.startsWith("UPDATE candidates") && sql.includes("skills = $2")) {
      const id = values[0] as string;
      const row = this.candidates.get(id);
      if (row) {
        row.skills = values[1];
        row.experience_years = values[2];
      }
      return { rows: [] };
    }

    if (
      sql.startsWith("SAVEPOINT ") ||
      sql.startsWith("RELEASE SAVEPOINT ") ||
      sql.startsWith("ROLLBACK TO SAVEPOINT ")
    ) {
      return { rows: [] };
    }

    throw new Error(`FakeTx: unhandled query: ${sql}`);
  };
}

let fakeTx: FakeTx;

beforeEach(() => {
  fakeTx = new FakeTx();
});

function seedBaseline() {
  fakeTx.seedCandidate({ id: "cand-source", name: "Nguyen Van A", email: "old@example.com", phone: "0900000001" });
  fakeTx.seedCandidate({ id: "cand-target", name: "Nguyen Van A Duplicate", email: "shared@example.com", phone: "0900000002" });

  fakeTx.seedCvVersion({
    id: "cv-edited",
    campaign_applied_id: "app-edited",
    version_number: 1,
    parsed_payload: { name: "Nguyen Van A", email: "shared@example.com" },
    skills: ["Old Skill"],
    role: "Backend",
    degree: null,
    education: null,
    experience_years: null,
    gpa: null,
    english_level: null,
    date_of_birth: null,
    student_years: null,
    matched_on: null,
    cv_storage_path: "s3://cv-edited.pdf",
    original_filename: "edited.pdf",
    mime_type: "application/pdf",
    cv_file_sha256: "sha-edited",
    cv_content_sha256: "content-edited",
    parsing_status: "completed",
    parsing_error: null,
  });

  fakeTx.seedApplication({
    id: "app-edited",
    candidate_id: "cand-source",
    job_id: "job-1",
    active_cv_version_id: "cv-edited",
    source: "LinkedIn",
    source_other: null,
  });

  // `findCandidatesByDedupeSignals` (real query) INNER JOINs campaign_applied
  // -- a candidate with zero applications can never surface as a dedupe
  // match, same as in production (every candidate is created alongside an
  // application). Seed one for the target on an unrelated job so it's
  // matchable without colliding with job-1.
  fakeTx.seedCvVersion({
    id: "cv-target-baseline",
    campaign_applied_id: "app-target-baseline",
    version_number: 1,
    parsed_payload: {},
    skills: [],
    role: null,
    degree: null,
    education: null,
    experience_years: null,
    gpa: null,
    english_level: null,
    date_of_birth: null,
    student_years: null,
    matched_on: null,
    cv_storage_path: null,
    original_filename: null,
    mime_type: null,
    cv_file_sha256: null,
    cv_content_sha256: null,
    parsing_status: "completed",
    parsing_error: null,
  });
  fakeTx.seedApplication({
    id: "app-target-baseline",
    candidate_id: "cand-target",
    job_id: "job-9",
    active_cv_version_id: "cv-target-baseline",
    source: "TopCV",
    source_other: null,
  });
}

describe("resolveProfileConflict", () => {
  it("bails out with 409 and no writes when the conflict has already evaporated", async () => {
    seedBaseline();
    // Target candidate no longer has the conflicting email.
    fakeTx.candidates.get("cand-target")!.email = "no-longer-shared@example.com";

    const result = await resolveProfileConflict({
      editedCampaignAppliedId: "app-edited",
      targetCandidateId: "cand-target",
      patch: patch({ email: "shared@example.com" }),
      createdBy: "user-1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    expect(fakeTx.writeCallCount()).toBe(0);
  });

  it("detects and resolves a conflict matched on phone, not just email", async () => {
    seedBaseline();
    // Target's phone is stored the way AI-parse/write paths actually leave
    // it -- raw, with spaces and a '+' -- not pre-normalized. The edit types
    // the same number in a completely different (plain digits, local
    // prefix) format. This must still be caught on the phone signal alone.
    fakeTx.candidates.get("cand-target")!.phone = "+84 912 345 678";

    const result = await resolveProfileConflict({
      editedCampaignAppliedId: "app-edited",
      targetCandidateId: "cand-target",
      patch: patch({ phone: "0912345678" }),
      createdBy: "user-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.survivingCampaignAppliedId).toBe("app-edited");
    expect(fakeTx.campaignApplied.get("app-edited")!.candidate_id).toBe("cand-target");
  });

  it("Path C: re-parents the edited application when there is no job collision", async () => {
    seedBaseline();
    // Target candidate has no application for job-1 at all.

    const result = await resolveProfileConflict({
      editedCampaignAppliedId: "app-edited",
      targetCandidateId: "cand-target",
      patch: patch({ email: "shared@example.com", skills: ["New Skill"] }),
      createdBy: "user-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.survivingCampaignAppliedId).toBe("app-edited");

    const app = fakeTx.campaignApplied.get("app-edited")!;
    expect(app.candidate_id).toBe("cand-target");

    const activeVersion = fakeTx.cvVersions.get(app.active_cv_version_id as string)!;
    expect(activeVersion.source_event).toBe("manual_edit");
    expect(activeVersion.skills).toEqual(["New Skill"]);

    // The source candidate had only this one application -- it's gone now.
    expect(fakeTx.candidates.has("cand-source")).toBe(false);
    // Target candidate's email was never rewritten -- it already had the
    // right value, which is why it matched in the first place.
    expect(fakeTx.candidates.get("cand-target")!.email).toBe("shared@example.com");
  });

  it("Path B: folds the edited application's CV into the existing same-job application", async () => {
    seedBaseline();
    fakeTx.seedCvVersion({
      id: "cv-colliding",
      campaign_applied_id: "app-colliding",
      version_number: 1,
      source_event: "initial_upload",
      parsed_payload: {},
      skills: [],
      role: null,
      degree: null,
      education: null,
      experience_years: null,
      gpa: null,
      english_level: null,
      date_of_birth: null,
      student_years: null,
      matched_on: null,
      cv_storage_path: null,
      original_filename: null,
      mime_type: null,
      cv_file_sha256: null,
      cv_content_sha256: null,
      parsing_status: "completed",
      parsing_error: null,
    });
    fakeTx.seedApplication({
      id: "app-colliding",
      candidate_id: "cand-target",
      job_id: "job-1", // same job as app-edited
      active_cv_version_id: "cv-colliding",
      source: "TopCV",
      source_other: null,
    });

    const result = await resolveProfileConflict({
      editedCampaignAppliedId: "app-edited",
      targetCandidateId: "cand-target",
      patch: patch({ email: "shared@example.com" }),
      createdBy: "user-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.survivingCampaignAppliedId).toBe("app-colliding");

    // The edited application is gone -- folded into the colliding one.
    expect(fakeTx.campaignApplied.has("app-edited")).toBe(false);
    expect(fakeTx.candidates.has("cand-source")).toBe(false);

    const survivor = fakeTx.campaignApplied.get("app-colliding")!;
    const activeVersion = fakeTx.cvVersions.get(survivor.active_cv_version_id as string)!;
    // Two versions were created on top of the colliding application: the
    // file_replaced copy, then the manual_edit layering the patch on top.
    expect(activeVersion.source_event).toBe("manual_edit");
    // Only the two *new* versions this merge created -- not the colliding
    // application's pre-existing `initial_upload` seed version.
    const newVersionsForSurvivor = [...fakeTx.cvVersions.values()].filter(
      (v) => v.campaign_applied_id === "app-colliding" && (v.id as string).startsWith("cv-new-"),
    );
    expect(newVersionsForSurvivor.map((v) => v.source_event)).toEqual([
      "file_replaced",
      "manual_edit",
    ]);

    // Regression: the patch only touched email, so `baseCvVersion` (the
    // file_replaced copy of the *source*'s own CV) still carries the
    // source's own name ("Nguyen Van A") in its parsed_payload. That must
    // never leak onto the target candidate's aggregate `name` -- the target
    // keeps its own identity except for whatever the patch explicitly
    // changed.
    expect(fakeTx.candidates.get("cand-target")?.name).toBe("Nguyen Van A Duplicate");
    expect(activeVersion.parsed_payload).toMatchObject({
      name: "Nguyen Van A Duplicate",
    });
  });

  it("leaves the source candidate's unrelated other application untouched", async () => {
    seedBaseline();
    fakeTx.seedCvVersion({
      id: "cv-other",
      campaign_applied_id: "app-other",
      version_number: 1,
      parsed_payload: {},
      skills: [],
      role: null,
      degree: null,
      education: null,
      experience_years: null,
      gpa: null,
      english_level: null,
      date_of_birth: null,
      student_years: null,
      matched_on: null,
      cv_storage_path: null,
      original_filename: null,
      mime_type: null,
      cv_file_sha256: null,
      cv_content_sha256: null,
      parsing_status: "completed",
      parsing_error: null,
    });
    fakeTx.seedApplication({
      id: "app-other",
      candidate_id: "cand-source",
      job_id: "job-2", // different job -- no collision, out of scope for this merge
      active_cv_version_id: "cv-other",
      source: "TopCV",
      source_other: null,
    });

    const result = await resolveProfileConflict({
      editedCampaignAppliedId: "app-edited",
      targetCandidateId: "cand-target",
      patch: patch({ email: "shared@example.com" }),
      createdBy: "user-1",
    });

    expect(result.ok).toBe(true);

    // The unrelated application is untouched: still under the source
    // candidate, which therefore still exists (not deleted).
    expect(fakeTx.campaignApplied.get("app-other")!.candidate_id).toBe("cand-source");
    expect(fakeTx.candidates.has("cand-source")).toBe(true);
    // No query ever mutated app-other or cand-source's contact info.
    const touchedOtherApp = fakeTx.calls.some(
      (c) =>
        /^(UPDATE|DELETE)/i.test(c.sql.trim()) &&
        c.values.includes("app-other"),
    );
    expect(touchedOtherApp).toBe(false);
  });

  it("surfaces an unexpected unique-violation race as a 409, not an unhandled rejection", async () => {
    seedBaseline();
    fakeTx.throwUniqueViolationOn = (sql) => sql.startsWith("UPDATE campaign_applied SET candidate_id = $2");

    const result = await resolveProfileConflict({
      editedCampaignAppliedId: "app-edited",
      targetCandidateId: "cand-target",
      patch: patch({ email: "shared@example.com" }),
      createdBy: "user-1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });
});
