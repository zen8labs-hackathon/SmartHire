import { describe, expect, it } from "vitest";

import {
  JOB_LEGACY_FLOW,
  isLegacyFlowJob,
  legacyFlowResponse,
} from "./legacy-flow";

describe("legacy flow guard helpers", () => {
  it("flags only flow_version 1 as legacy", () => {
    expect(isLegacyFlowJob({ flow_version: 1 })).toBe(true);
    expect(isLegacyFlowJob({ flow_version: 2 })).toBe(false);
    expect(isLegacyFlowJob(null)).toBe(false);
  });

  it("responds 409 with the JOB_LEGACY_FLOW code", async () => {
    const res = legacyFlowResponse();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe(JOB_LEGACY_FLOW);
  });
});
