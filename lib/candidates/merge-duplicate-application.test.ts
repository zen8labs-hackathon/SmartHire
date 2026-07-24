import { describe, expect, it, vi } from "vitest";

import { deleteCandidateIfNoOtherApplications } from "./merge-duplicate-application";

function fakeDb() {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  return { query };
}

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
