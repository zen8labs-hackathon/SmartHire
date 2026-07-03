import { describe, expect, it, vi } from "vitest";
import { upsertJobStageMappings } from "./upsert-job-stage-mappings";

interface RecordedCall {
  method: string;
  args: unknown[];
}

/**
 * Minimal fake Supabase query-builder chain. Each `.from(...)` call consumes
 * the next queued response and returns a thenable chain object that records
 * every method invocation (select/eq/is/in/update/insert) so tests can assert
 * exactly which mutations were issued and with what arguments/ids.
 */
function createMockSupabase(responses: Array<{ data?: unknown; error: unknown }>) {
  let call = 0;
  const calls: RecordedCall[] = [];

  const from = vi.fn(() => {
    const response = responses[call];
    call++;

    const record = (method: string, args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };

    const builder: {
      select: (...args: unknown[]) => typeof builder;
      eq: (...args: unknown[]) => typeof builder;
      is: (...args: unknown[]) => typeof builder;
      in: (...args: unknown[]) => typeof builder;
      update: (...args: unknown[]) => typeof builder;
      insert: (...args: unknown[]) => typeof builder;
      then: (
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown,
      ) => Promise<unknown>;
    } = {
      select: (...args: unknown[]) => record("select", args),
      eq: (...args: unknown[]) => record("eq", args),
      is: (...args: unknown[]) => record("is", args),
      in: (...args: unknown[]) => record("in", args),
      update: (...args: unknown[]) => record("update", args),
      insert: (...args: unknown[]) => record("insert", args),
      then: (resolve, reject) => Promise.resolve(response).then(resolve, reject),
    };

    return builder;
  });

  return { from, calls };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asSupabase(from: unknown): any {
  return { from };
}

describe("upsertJobStageMappings", () => {
  it("unchanged stage list: no insert, no soft-delete, only sequence_number updates, ids preserved", async () => {
    const activeMappings = [
      { id: "m1", pipeline_stage_id: "s1", sequence_number: 1 },
      { id: "m2", pipeline_stage_id: "s2", sequence_number: 2 },
    ];
    const { from, calls } = createMockSupabase([
      { data: activeMappings, error: null }, // select active mappings
      { error: null }, // update m1 sequence_number
      { error: null }, // update m2 sequence_number
    ]);

    const result = await upsertJobStageMappings(asSupabase(from), "opening-1", ["s1", "s2"]);

    expect(result.error).toBeNull();

    const inserts = calls.filter((c) => c.method === "insert");
    expect(inserts).toHaveLength(0);

    const softDeletes = calls.filter(
      (c) => c.method === "update" && (c.args[0] as Record<string, unknown>).deleted_at,
    );
    expect(softDeletes).toHaveLength(0);

    const sequenceUpdates = calls.filter(
      (c) => c.method === "update" && "sequence_number" in (c.args[0] as Record<string, unknown>),
    );
    expect(sequenceUpdates).toHaveLength(2);

    const updatedIds = calls
      .filter((c) => c.method === "eq" && c.args[0] === "id")
      .map((c) => c.args[1]);
    expect(updatedIds).toEqual(["m1", "m2"]);
  });

  it("adding one new stage to an existing list: existing ids untouched, exactly one insert, no soft-deletes", async () => {
    const activeMappings = [{ id: "m1", pipeline_stage_id: "s1", sequence_number: 1 }];
    const { from, calls } = createMockSupabase([
      { data: activeMappings, error: null }, // select active mappings
      { error: null }, // update m1 sequence_number
      { error: null }, // insert s2
    ]);

    const result = await upsertJobStageMappings(asSupabase(from), "opening-1", ["s1", "s2"]);

    expect(result.error).toBeNull();

    const softDeletes = calls.filter(
      (c) => c.method === "update" && (c.args[0] as Record<string, unknown>).deleted_at,
    );
    expect(softDeletes).toHaveLength(0);

    const updatedIds = calls
      .filter((c) => c.method === "eq" && c.args[0] === "id")
      .map((c) => c.args[1]);
    expect(updatedIds).toEqual(["m1"]);

    const inserts = calls.filter((c) => c.method === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].args[0]).toEqual([
      { job_opening_id: "opening-1", pipeline_stage_id: "s2", sequence_number: 2 },
    ]);
  });

  it("removing one stage: remaining ids untouched, the removed stage's row soft-deleted, no inserts", async () => {
    const activeMappings = [
      { id: "m1", pipeline_stage_id: "s1", sequence_number: 1 },
      { id: "m2", pipeline_stage_id: "s2", sequence_number: 2 },
    ];
    const { from, calls } = createMockSupabase([
      { data: activeMappings, error: null }, // select active mappings
      { error: null }, // soft-delete m2
      { error: null }, // update m1 sequence_number
    ]);

    const result = await upsertJobStageMappings(asSupabase(from), "opening-1", ["s1"]);

    expect(result.error).toBeNull();

    const inserts = calls.filter((c) => c.method === "insert");
    expect(inserts).toHaveLength(0);

    const softDeletes = calls.filter(
      (c) => c.method === "update" && (c.args[0] as Record<string, unknown>).deleted_at,
    );
    expect(softDeletes).toHaveLength(1);
    const softDeletedIds = calls
      .filter((c) => c.method === "in" && c.args[0] === "id")
      .map((c) => c.args[1]);
    expect(softDeletedIds).toEqual([["m2"]]);

    const updatedIds = calls
      .filter((c) => c.method === "eq" && c.args[0] === "id")
      .map((c) => c.args[1]);
    expect(updatedIds).toEqual(["m1"]);
  });

  it("empty new stage list: all active mappings soft-deleted", async () => {
    const activeMappings = [
      { id: "m1", pipeline_stage_id: "s1", sequence_number: 1 },
      { id: "m2", pipeline_stage_id: "s2", sequence_number: 2 },
    ];
    const { from, calls } = createMockSupabase([
      { data: activeMappings, error: null }, // select active mappings
      { error: null }, // soft-delete m1, m2
    ]);

    const result = await upsertJobStageMappings(asSupabase(from), "opening-1", []);

    expect(result.error).toBeNull();

    const inserts = calls.filter((c) => c.method === "insert");
    expect(inserts).toHaveLength(0);

    const sequenceUpdates = calls.filter(
      (c) => c.method === "update" && "sequence_number" in (c.args[0] as Record<string, unknown>),
    );
    expect(sequenceUpdates).toHaveLength(0);

    const softDeletedIds = calls
      .filter((c) => c.method === "in" && c.args[0] === "id")
      .map((c) => c.args[1]);
    expect(softDeletedIds).toEqual([["m1", "m2"]]);
  });

  it("propagates the select error without mutating anything", async () => {
    const { from, calls } = createMockSupabase([
      { data: null, error: { message: "boom" } },
    ]);

    const result = await upsertJobStageMappings(asSupabase(from), "opening-1", ["s1"]);

    expect(result.error).toContain("boom");
    expect(calls.filter((c) => c.method === "insert")).toHaveLength(0);
    expect(calls.filter((c) => c.method === "update")).toHaveLength(0);
  });
});
