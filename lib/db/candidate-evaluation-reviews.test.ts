import { describe, expect, it, vi } from "vitest";

import {
  createCandidateEvaluationReview,
  getCandidateEvaluationReviewByToken,
  getCandidateEvaluationReviewById,
  listCandidateEvaluationReviewsByCampaignApplied,
  revokeCandidateEvaluationReview,
} from "@/lib/db/candidate-evaluation-reviews";

function fakeDb(rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query };
}

describe("getCandidateEvaluationReviewById", () => {
  it("selects by id", async () => {
    const row = { id: "1" };
    const db = fakeDb([row]);
    const result = await getCandidateEvaluationReviewById(db, "1");
    expect(result).toEqual(row);
  });
});

describe("getCandidateEvaluationReviewByToken", () => {
  it("selects by preview_token without filtering expiry/revocation", async () => {
    const row = { id: "1", preview_token: "abc123" };
    const db = fakeDb([row]);

    const result = await getCandidateEvaluationReviewByToken(db, "abc123");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `SELECT * FROM candidate_evaluation_reviews WHERE preview_token = $1`,
      ["abc123"],
    );
  });

  it("returns null for an unknown token", async () => {
    const db = fakeDb([]);
    const result = await getCandidateEvaluationReviewByToken(db, "missing");
    expect(result).toBeNull();
  });
});

describe("listCandidateEvaluationReviewsByCampaignApplied", () => {
  it("orders by created_at descending", async () => {
    const db = fakeDb([]);
    await listCandidateEvaluationReviewsByCampaignApplied(db, "app-1");
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY id DESC"),
      ["app-1"],
    );
  });
});

describe("createCandidateEvaluationReview", () => {
  it("serializes ai_field_mapping and defaults expires_at/ai_field_mapping", async () => {
    const row = { id: "1" };
    const db = fakeDb([row]);

    await createCandidateEvaluationReview(db, {
      campaignAppliedId: "app-1",
      candidateName: "Ada Lovelace",
      reviewerNotes: "Strong candidate",
      filledPdfStoragePath: "evaluations/1.pdf",
      aiFieldMapping: { skills: "matched" },
    });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("COALESCE($5, now() + interval '30 days')");
    expect(sql).toContain("COALESCE($6::jsonb, '{}')");
    expect(values).toEqual([
      "app-1",
      "Ada Lovelace",
      "Strong candidate",
      "evaluations/1.pdf",
      null,
      JSON.stringify({ skills: "matched" }),
      null,
    ]);
  });
});

describe("revokeCandidateEvaluationReview", () => {
  it("sets revoked_at only when not already revoked", async () => {
    const row = { id: "1", revoked_at: "2026-07-13T00:00:00Z" };
    const db = fakeDb([row]);

    const result = await revokeCandidateEvaluationReview(db, "1");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `UPDATE candidate_evaluation_reviews
     SET revoked_at = now()
     WHERE id = $1 AND revoked_at IS NULL
     RETURNING *`,
      ["1"],
    );
  });

  it("returns null when already revoked", async () => {
    const db = fakeDb([]);
    const result = await revokeCandidateEvaluationReview(db, "1");
    expect(result).toBeNull();
  });
});
