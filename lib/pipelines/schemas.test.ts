import { describe, expect, it } from "vitest";

import { createPipelineSchema, libraryStageBodySchema, updatePipelineSchema } from "@/lib/pipelines/schemas";

const row = (stageCode: string) => ({ stageCode });

describe("createPipelineSchema", () => {
  it("applies SLA default 5 and schedule false", () => {
    const r = createPipelineSchema.parse({ name: " Dev ", rows: [row("cv")] });
    expect(r.name).toBe("Dev");
    expect(r.rows[0]).toEqual({ stageCode: "cv", slaDays: 5, schedule: false });
  });
  it("rejects empty rows and duplicate stages", () => {
    expect(createPipelineSchema.safeParse({ name: "a", rows: [] }).success).toBe(false);
    expect(
      createPipelineSchema.safeParse({ name: "a", rows: [row("cv"), row("cv")] }).success,
    ).toBe(false);
  });
  it("rejects negative SLA", () => {
    expect(
      createPipelineSchema.safeParse({ name: "a", rows: [{ stageCode: "cv", slaDays: -1 }] }).success,
    ).toBe(false);
  });
});

describe("updatePipelineSchema", () => {
  it("requires at least one field", () => {
    expect(updatePipelineSchema.safeParse({}).success).toBe(false);
    expect(updatePipelineSchema.safeParse({ name: "x" }).success).toBe(true);
  });
});

describe("libraryStageBodySchema", () => {
  const sub = (code: string, o: Record<string, boolean> = {}) => ({ code, label: code, ...o });
  const ok = [sub("new", { def: true }), sub("passed", { pass: true }), sub("rejected", { terminal: true })];
  const parse = (subs: unknown[]) => libraryStageBodySchema.safeParse({ label: "S", subs });

  it("accepts a valid stage and defaults type to none", () => {
    const r = parse(ok);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.type).toBe("none");
  });
  it("requires exactly one entry step", () => {
    expect(parse([sub("a", { pass: true }), sub("b")]).success).toBe(false);
    expect(parse([sub("a", { def: true, pass: true }), sub("b", { def: true })]).success).toBe(false);
  });
  it("requires a passing step", () => {
    expect(parse([sub("a", { def: true }), sub("b", { terminal: true })]).success).toBe(false);
  });
  it("withdraw implies terminal; entry/pass cannot be terminal", () => {
    expect(parse([...ok, sub("w", { withdraw: true })]).success).toBe(false);
    expect(parse([sub("a", { def: true, terminal: true }), sub("b", { pass: true })]).success).toBe(false);
    expect(parse([sub("a", { def: true }), sub("b", { pass: true, terminal: true })]).success).toBe(false);
  });
  it("rejects duplicate sub codes", () => {
    expect(parse([...ok, sub("new")]).success).toBe(false);
  });
});
