import { describe, expect, it, vi } from "vitest";
import { upsertJobStageMappings } from "./upsert-job-stage-mappings";

/**
 * The reconciliation logic itself now lives in the `upsert_job_stage_mappings`
 * Postgres function (see migration 20260706120000_atomic_upsert_job_stage_mappings_fn.sql)
 * so it runs as a single transaction. These tests only cover the thin RPC
 * wrapper; the SQL function's behavior should be exercised against a real
 * Postgres instance (e.g. via the Supabase MCP / db:migrate + manual query).
 */
function createMockSupabase(response: { error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(response);
  return { rpc };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asSupabase(rpc: unknown): any {
  return { rpc };
}

describe("upsertJobStageMappings", () => {
  it("calls the upsert_job_stage_mappings RPC with the job opening id and stage ids", async () => {
    const { rpc } = createMockSupabase({ error: null });

    const result = await upsertJobStageMappings(asSupabase(rpc), "opening-1", ["s1", "s2"]);

    expect(result.error).toBeNull();
    expect(rpc).toHaveBeenCalledWith("upsert_job_stage_mappings", {
      p_job_opening_id: "opening-1",
      p_stage_ids: ["s1", "s2"],
    });
  });

  it("defaults null pipelineStages to an empty array", async () => {
    const { rpc } = createMockSupabase({ error: null });

    const result = await upsertJobStageMappings(asSupabase(rpc), "opening-1", null);

    expect(result.error).toBeNull();
    expect(rpc).toHaveBeenCalledWith("upsert_job_stage_mappings", {
      p_job_opening_id: "opening-1",
      p_stage_ids: [],
    });
  });

  it("defaults undefined pipelineStages to an empty array", async () => {
    const { rpc } = createMockSupabase({ error: null });

    const result = await upsertJobStageMappings(asSupabase(rpc), "opening-1", undefined);

    expect(result.error).toBeNull();
    expect(rpc).toHaveBeenCalledWith("upsert_job_stage_mappings", {
      p_job_opening_id: "opening-1",
      p_stage_ids: [],
    });
  });

  it("propagates the RPC error without swallowing it", async () => {
    const { rpc } = createMockSupabase({ error: { message: "boom" } });

    const result = await upsertJobStageMappings(asSupabase(rpc), "opening-1", ["s1"]);

    expect(result.error).toContain("boom");
  });
});
