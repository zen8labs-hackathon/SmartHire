import { beforeEach, describe, expect, it } from "vitest";

import { reassignCvVersionToApplication } from "./reassign-cv-version";

type Row = Record<string, unknown>;

/** Dispatches on SQL shape rather than call order -- see the equivalent fake in resolve-profile-conflict.test.ts for the full rationale. */
class FakeTx {
  campaignApplied = new Map<string, Row>();
  cvVersions = new Map<string, Row>();
  candidates = new Map<string, Row>();
  private nextCvId = 100;

  seedApplication(row: Row) {
    this.campaignApplied.set(row.id as string, { deleted_at: null, ...row });
  }
  seedCvVersion(row: Row) {
    this.cvVersions.set(row.id as string, row);
  }
  seedCandidate(row: Row) {
    this.candidates.set(row.id as string, { deleted_at: null, ...row });
  }

  query = async <R = Row>(
    rawSql: string,
    values: unknown[] = [],
  ): Promise<{ rows: R[] }> => {
    const { rows } = await this.dispatch(rawSql, values);
    return { rows: rows as unknown as R[] };
  };

  private dispatch = async (rawSql: string, values: unknown[] = []): Promise<{ rows: Row[] }> => {
    const sql = rawSql.replace(/\s+/g, " ").trim();

    if (sql.startsWith("SELECT id FROM campaign_applied WHERE id = $1 FOR UPDATE")) {
      const row = this.campaignApplied.get(values[0] as string);
      return { rows: row ? [{ id: row.id }] : [] };
    }
    if (sql.startsWith("SELECT * FROM campaign_applied WHERE id = $1 AND deleted_at IS NULL")) {
      const row = this.campaignApplied.get(values[0] as string);
      return { rows: row && !row.deleted_at ? [{ ...row }] : [] };
    }
    if (sql.startsWith("SELECT * FROM cv_detail_versions WHERE id = $1")) {
      const row = this.cvVersions.get(values[0] as string);
      return { rows: row ? [{ ...row }] : [] };
    }
    if (
      sql.startsWith(
        "SELECT * FROM cv_detail_versions WHERE campaign_applied_id = $1 ORDER BY version_number DESC",
      )
    ) {
      const campaignAppliedId = values[0] as string;
      const rows = [...this.cvVersions.values()]
        .filter((v) => v.campaign_applied_id === campaignAppliedId)
        .sort((a, b) => (b.version_number as number) - (a.version_number as number));
      return { rows: rows.map((r) => ({ ...r })) };
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
      const id = String(this.nextCvId++);
      const row: Row = {
        id,
        campaign_applied_id: values[0],
        version_number: values[1],
        source_event: values[2],
        cv_storage_path: values[3],
        original_filename: values[4],
        matched_on: values[20],
        change_summary: values[21],
        created_by: values[22],
        created_at: new Date(),
      };
      this.cvVersions.set(id, row);
      return { rows: [row] };
    }
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
    if (sql.startsWith("UPDATE candidates") && sql.includes("skills = $2")) {
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

function seedTwoApplicationsOnSameJob() {
  fakeTx.seedCandidate({ id: "cand-A", name: "Candidate A" });
  fakeTx.seedCandidate({ id: "cand-B", name: "Candidate B" });

  fakeTx.seedCvVersion({
    id: "cv-A-original",
    campaign_applied_id: "app-A",
    version_number: 1,
    parsed_payload: { name: "Candidate A" },
    skills: [],
    cv_storage_path: "s3://a-original.pdf",
    original_filename: "a-original.pdf",
    parsing_status: "completed",
    // This version's own AI JD-match result, from back when it was active
    // and got scored -- distinct from app-A's *current* cache (which
    // reflects cv-wrong, the version that's active right now).
    jd_match_status: "completed",
    jd_match_score: 77,
    jd_match_error: null,
    jd_match_rationale: "original-rationale",
  });
  fakeTx.seedCvVersion({
    id: "cv-wrong",
    campaign_applied_id: "app-A",
    version_number: 2,
    parsed_payload: { name: "Candidate B" },
    skills: ["Wrongly attributed"],
    cv_storage_path: "s3://b-cv.pdf",
    original_filename: "b-cv.pdf",
    parsing_status: "completed",
    matched_on: "email",
  });
  fakeTx.seedApplication({
    id: "app-A",
    candidate_id: "cand-A",
    job_id: "job-1",
    active_cv_version_id: "cv-wrong",
    // Cached score for whatever is *currently* active (cv-wrong) -- computed
    // against the misattributed CV, but still validly "this file vs this
    // job" since the file itself isn't what's wrong.
    jd_match_status: "completed",
    jd_match_score: 42,
    jd_match_error: null,
    jd_match_rationale: "wrong-cv-rationale",
  });

  fakeTx.seedApplication({
    id: "app-B",
    candidate_id: "cand-B",
    job_id: "job-1",
    active_cv_version_id: null,
  });
}

describe("reassignCvVersionToApplication", () => {
  it("copies the misattributed version onto target and rolls source back to its previous version", async () => {
    seedTwoApplicationsOnSameJob();

    const result = await reassignCvVersionToApplication(fakeTx, {
      sourceCampaignAppliedId: "app-A",
      targetCampaignAppliedId: "app-B",
      changeSummary: null,
      createdBy: "user-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Target now has the reassigned CV as its own new version.
    const target = fakeTx.campaignApplied.get("app-B")!;
    expect(target.active_cv_version_id).toBe(result.newCvVersionId);
    const newVersion = fakeTx.cvVersions.get(result.newCvVersionId)!;
    expect(newVersion.campaign_applied_id).toBe("app-B");
    expect(newVersion.original_filename).toBe("b-cv.pdf");
    expect(newVersion.source_event).toBe("file_replaced");

    // Source rolled back to its own original version -- not left pointing
    // at the (still-existing, unmoved) misattributed row.
    const source = fakeTx.campaignApplied.get("app-A")!;
    expect(source.active_cv_version_id).toBe("cv-A-original");

    // The original misattributed row is untouched, still under app-A, for
    // audit purposes -- never moved or deleted.
    expect(fakeTx.cvVersions.get("cv-wrong")?.campaign_applied_id).toBe("app-A");

    // Target inherits app-A's *current* JD-match cache (computed against
    // this exact file, still valid against the same job) instead of being
    // forced to re-score.
    expect(target.jd_match_status).toBe("completed");
    expect(target.jd_match_score).toBe(42);
    expect(target.jd_match_rationale).toBe("wrong-cv-rationale");

    // Source's cache is restored to whatever score belongs to the version
    // that's active again now -- not left showing the departed version's
    // stale score.
    expect(source.jd_match_status).toBe("completed");
    expect(source.jd_match_score).toBe(77);
    expect(source.jd_match_rationale).toBe("original-rationale");
  });

  it("resets target's JD-match cache instead of copying it when reassigning a non-active (unscored-in-cache) version", async () => {
    seedTwoApplicationsOnSameJob();
    // app-A's active version is back to its own original -- cv-wrong is
    // just sitting in history, not active. app-A's cache therefore reflects
    // cv-A-original, not cv-wrong -- copying it onto target would be wrong.
    fakeTx.campaignApplied.get("app-A")!.active_cv_version_id = "cv-A-original";
    fakeTx.campaignApplied.get("app-A")!.jd_match_status = "completed";
    fakeTx.campaignApplied.get("app-A")!.jd_match_score = 77;

    const result = await reassignCvVersionToApplication(fakeTx, {
      sourceCampaignAppliedId: "app-A",
      cvVersionId: "cv-wrong",
      targetCampaignAppliedId: "app-B",
      changeSummary: null,
      createdBy: "user-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const target = fakeTx.campaignApplied.get("app-B")!;
    expect(target.jd_match_status).toBe("pending");
    expect(target.jd_match_score).toBeNull();
    // Source's own cache (for its real active version, cv-A-original) is
    // untouched -- this reassign never changed what's active on source.
    expect(fakeTx.campaignApplied.get("app-A")!.jd_match_score).toBe(77);
  });

  it("does not touch source's active pointer when the reassigned version wasn't the active one", async () => {
    seedTwoApplicationsOnSameJob();
    // app-A's active version is back to its own original -- cv-wrong is
    // just sitting in history, not active.
    fakeTx.campaignApplied.get("app-A")!.active_cv_version_id = "cv-A-original";

    const result = await reassignCvVersionToApplication(fakeTx, {
      sourceCampaignAppliedId: "app-A",
      cvVersionId: "cv-wrong",
      targetCampaignAppliedId: "app-B",
      changeSummary: null,
      createdBy: "user-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sourceActiveCvVersionId).toBe("cv-A-original");
    expect(fakeTx.campaignApplied.get("app-A")!.active_cv_version_id).toBe(
      "cv-A-original",
    );
  });

  it("rejects when target is for a different job", async () => {
    seedTwoApplicationsOnSameJob();
    fakeTx.campaignApplied.get("app-B")!.job_id = "job-2";

    const result = await reassignCvVersionToApplication(fakeTx, {
      sourceCampaignAppliedId: "app-A",
      targetCampaignAppliedId: "app-B",
      changeSummary: null,
      createdBy: "user-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });

  it("rejects when the active version is the only version the source has, writing nothing", async () => {
    seedTwoApplicationsOnSameJob();
    fakeTx.cvVersions.delete("cv-A-original");
    const cvVersionCountBefore = fakeTx.cvVersions.size;

    const result = await reassignCvVersionToApplication(fakeTx, {
      sourceCampaignAppliedId: "app-A",
      targetCampaignAppliedId: "app-B",
      changeSummary: null,
      createdBy: "user-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);

    // Regression guard: this must be rejected *before* anything is written --
    // `withTransaction` only rolls back on a thrown error, not on an
    // `{ ok: false }` return, so an error surfacing after a partial write
    // would silently commit it instead of aborting cleanly.
    expect(fakeTx.cvVersions.size).toBe(cvVersionCountBefore);
    expect(fakeTx.campaignApplied.get("app-A")!.active_cv_version_id).toBe(
      "cv-wrong",
    );
    expect(fakeTx.campaignApplied.get("app-B")!.active_cv_version_id).toBeNull();
  });

  it("rejects source and target being the same application", async () => {
    seedTwoApplicationsOnSameJob();

    const result = await reassignCvVersionToApplication(fakeTx, {
      sourceCampaignAppliedId: "app-A",
      targetCampaignAppliedId: "app-A",
      changeSummary: null,
      createdBy: "user-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });
});
