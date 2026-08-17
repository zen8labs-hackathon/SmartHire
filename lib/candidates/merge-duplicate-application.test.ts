import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression guard for the `resolveProfileConflict` refactor: these two
// functions used to open their own `withTransaction` internally, which made
// them impossible to compose into a larger transaction. Mocking `getPool`/
// `withTransaction` to throw proves neither function reaches for them
// anymore -- they must do all their work through the `db` parameter the
// caller supplies.
vi.mock("@/lib/db/config/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/config/client")>();
  return {
    ...actual,
    getPool: () => {
      throw new Error("must not call getPool -- caller owns the connection now");
    },
    withTransaction: () => {
      throw new Error("must not call withTransaction -- caller owns the transaction now");
    },
  };
});

import {
  deleteCandidateIfNoOtherApplications,
  linkApplicationToExistingCandidate,
  mergeDuplicateApplicationIntoExisting,
} from "./merge-duplicate-application";

function fakeDb() {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  return { query };
}

type Row = Record<string, unknown>;

/** Dispatches on SQL shape rather than call order -- see the equivalent fake in resolve-profile-conflict.test.ts for the full rationale. */
class FakeTx {
  campaignApplied = new Map<string, Row>();
  cvVersions = new Map<string, Row>();
  candidates = new Map<string, Row>();
  private nextCvId = 1;

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

    if (sql.startsWith("SELECT * FROM campaign_applied WHERE id = $1 AND deleted_at IS NULL")) {
      const row = this.campaignApplied.get(values[0] as string);
      return { rows: row && !row.deleted_at ? [{ ...row }] : [] };
    }
    if (sql.startsWith("SELECT * FROM cv_detail_versions WHERE id = $1")) {
      const row = this.cvVersions.get(values[0] as string);
      return { rows: row ? [{ ...row }] : [] };
    }
    if (sql.startsWith("SELECT id FROM campaign_applied WHERE id = $1 FOR UPDATE")) {
      const row = this.campaignApplied.get(values[0] as string);
      return { rows: row ? [{ id: row.id }] : [] };
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
    if (sql.startsWith("UPDATE campaign_applied SET candidate_id = $2")) {
      const [id, candidateId] = values as [string, string];
      const row = this.campaignApplied.get(id);
      if (row) row.candidate_id = candidateId;
      return { rows: [] };
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

describe("deleteCandidateIfNoOtherApplications", () => {
  it("issues a single atomic DELETE guarded by a NOT EXISTS subquery, not a separate SELECT-then-DELETE", async () => {
    // Regression guard for the race this was rewritten to close: a
    // SELECT-then-DELETE has a gap where a new campaign_applied row could be
    // inserted and committed against this candidate between the check and
    // the delete, which would then get silently cascade-deleted along with
    // it. Folding the check into the DELETE's own WHERE clause makes it
    // atomic against the same MVCC snapshot the DELETE itself acts on.
    const db = fakeDb();

    await deleteCandidateIfNoOtherApplications(db, "cand-1");

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("DELETE FROM candidates");
    expect(sql).toContain("NOT EXISTS (SELECT 1 FROM campaign_applied WHERE candidate_id = $1)");
    expect(values).toEqual(["cand-1"]);
  });
});

describe("mergeDuplicateApplicationIntoExisting", () => {
  it("does all its work through the injected db, without opening its own transaction", async () => {
    fakeTx.seedCandidate({ id: "cand-existing" });
    fakeTx.seedCandidate({ id: "cand-duplicate" });
    fakeTx.seedCvVersion({
      id: "cv-dup",
      campaign_applied_id: "app-dup",
      version_number: 1,
      cv_storage_path: "s3://dup.pdf",
      original_filename: "dup.pdf",
    });
    fakeTx.seedApplication({
      id: "app-existing",
      candidate_id: "cand-existing",
      active_cv_version_id: null,
    });
    fakeTx.seedApplication({
      id: "app-dup",
      candidate_id: "cand-duplicate",
      active_cv_version_id: "cv-dup",
    });

    const result = await mergeDuplicateApplicationIntoExisting(
      fakeTx,
      "app-existing",
      "app-dup",
      "email",
      "user-1",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fakeTx.cvVersions.get(result.mergedCvVersionId)?.source_event).toBe(
      "file_replaced",
    );
    expect(fakeTx.campaignApplied.has("app-dup")).toBe(false);
    expect(fakeTx.candidates.has("cand-duplicate")).toBe(false);
    expect(fakeTx.campaignApplied.get("app-existing")?.active_cv_version_id).toBe(
      result.mergedCvVersionId,
    );
  });
});

describe("linkApplicationToExistingCandidate", () => {
  it("does all its work through the injected db, without opening its own transaction", async () => {
    fakeTx.seedCandidate({ id: "cand-existing" });
    fakeTx.seedCandidate({ id: "cand-orphan" });
    fakeTx.seedApplication({
      id: "app-new",
      candidate_id: "cand-orphan",
      active_cv_version_id: null,
    });

    const result = await linkApplicationToExistingCandidate(
      fakeTx,
      "app-new",
      "cand-existing",
    );

    expect(result.ok).toBe(true);
    expect(fakeTx.campaignApplied.get("app-new")?.candidate_id).toBe("cand-existing");
    // Orphan candidate had no other application left -- cleaned up.
    expect(fakeTx.candidates.has("cand-orphan")).toBe(false);
  });
});
