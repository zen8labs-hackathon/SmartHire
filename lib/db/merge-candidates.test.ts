import { describe, expect, it, vi } from "vitest";

import { mergeCandidates } from "@/lib/db/merge-candidates";

function fakeDb(rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query };
}

describe("mergeCandidates", () => {
  it("calls the merge_candidates() function with duplicate then canonical id", async () => {
    const db = fakeDb([{ merge_candidates: 3 }]);

    const result = await mergeCandidates(db, "dup-1", "canon-1");

    expect(result).toBe(3);
    expect(db.query).toHaveBeenCalledWith(
      `SELECT merge_candidates($1, $2) AS merge_candidates`,
      ["dup-1", "canon-1"],
    );
  });

  it("returns 0 when no row comes back", async () => {
    const db = fakeDb([]);
    const result = await mergeCandidates(db, "dup-1", "canon-1");
    expect(result).toBe(0);
  });

  it("propagates a thrown error from the underlying RAISE EXCEPTION", async () => {
    const query = vi
      .fn()
      .mockRejectedValue(new Error("merge_candidates: duplicate_id and canonical_id must differ"));
    const db = { query };

    await expect(mergeCandidates(db, "same-id", "same-id")).rejects.toThrow(
      "must differ",
    );
  });
});
