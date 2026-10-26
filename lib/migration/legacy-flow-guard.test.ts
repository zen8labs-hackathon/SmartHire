import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("@/lib/db/config/client", () => ({ getPool: () => ({ query }) }));

import { guardLegacyApplication, guardLegacyJob } from "./legacy-flow-guard";
import { JOB_LEGACY_FLOW } from "./legacy-flow";

beforeEach(() => query.mockReset());

describe("guardLegacyJob", () => {
  it("blocks a legacy job with 409 JOB_LEGACY_FLOW", async () => {
    query.mockResolvedValue({ rows: [{ flow_version: 1 }] });
    const res = await guardLegacyJob("job-1");
    expect(res?.status).toBe(409);
    expect((await res!.json()).code).toBe(JOB_LEGACY_FLOW);
  });

  it("allows a converted (new-flow) job", async () => {
    query.mockResolvedValue({ rows: [{ flow_version: 2 }] });
    expect(await guardLegacyJob("job-1")).toBeNull();
  });

  it("allows when there is no job (pool upload) or the job is missing", async () => {
    expect(await guardLegacyJob(null)).toBeNull();
    expect(query).not.toHaveBeenCalled();
    query.mockResolvedValue({ rows: [] });
    expect(await guardLegacyJob("gone")).toBeNull();
  });
});

describe("guardLegacyApplication", () => {
  it("blocks applications of legacy jobs and allows new-flow ones", async () => {
    query.mockResolvedValueOnce({ rows: [{ flow_version: 1 }] });
    expect((await guardLegacyApplication("a1"))?.status).toBe(409);
    query.mockResolvedValueOnce({ rows: [{ flow_version: 2 }] });
    expect(await guardLegacyApplication("a1")).toBeNull();
  });
});

// Every write route must keep its guard; reads must stay unguarded.
const API = join(process.cwd(), "app/api/admin");
const read = (p: string) => readFileSync(join(API, p), "utf8");
const handler = (src: string, method: string) => {
  const i = src.indexOf(`export async function ${method}(`);
  const rest = src.slice(i + 1);
  const next = rest.search(/\nexport async function /);
  return src.slice(i, next === -1 ? undefined : i + 1 + next);
};

describe("write routes carry the legacy guard", () => {
  const writes: [string, string[]][] = [
    ["candidates/[id]/route.ts", ["PATCH", "DELETE"]],
    ["candidates/[id]/timeline/route.ts", ["PATCH", "DELETE"]],
    ["candidates/[id]/timeline/no-show/route.ts", ["POST"]],
    ["candidates/[id]/reject/undo/route.ts", ["POST"]],
    ["candidates/pipeline/route.ts", ["POST"]],
    ["candidates/[id]/update-with-history/route.ts", ["PUT"]],
    ["candidates/[id]/restore-version/route.ts", ["POST"]],
    ["candidates/[id]/replace/route.ts", ["POST"]],
    ["candidates/[id]/process/route.ts", ["POST"]],
    ["candidates/[id]/rescore/route.ts", ["POST"]],
    ["candidates/[id]/reassign-cv-version/route.ts", ["PUT"]],
    ["positions/[id]/route.ts", ["PATCH"]],
    ["positions/[id]/transition/route.ts", ["POST"]],
    ["positions/[id]/criteria/route.ts", ["PUT"]],
    ["positions/[id]/cv-uploads/route.ts", ["POST"]],
    ["positions/[id]/cv-uploads/enqueue/route.ts", ["POST"]],
    ["positions/[id]/reprocess/route.ts", ["POST"]],
    ["positions/[id]/request-review/route.ts", ["POST"]],
    ["positions/[id]/rescore/route.ts", ["POST"]],
  ];
  it.each(writes)("%s", (file, methods) => {
    const src = read(file);
    for (const m of methods) expect(handler(src, m)).toMatch(/guardLegacy(Job|Application)\(/);
  });

  it("GET handlers stay unguarded", () => {
    for (const f of ["candidates/[id]/route.ts", "candidates/[id]/timeline/route.ts", "positions/[id]/route.ts"]) {
      expect(handler(read(f), "GET")).not.toMatch(/guardLegacy/);
    }
  });
});
