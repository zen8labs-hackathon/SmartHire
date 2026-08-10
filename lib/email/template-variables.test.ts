import { describe, expect, it } from "vitest";

import { buildCandidateEmailVariables } from "@/lib/email/template-variables";
import type { CandidateRow } from "@/lib/db/candidates";

const candidate: CandidateRow = {
  id: "c1",
  name: "An Nguyen",
  email: "an@candidate.test",
  phone: null,
  degree: null,
  education: null,
  role: null,
  experience_years: null,
  skills: [],
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
};

describe("buildCandidateEmailVariables", () => {
  it("defaults user_name/user_email/user_phone/pipeline_stage to empty strings when not provided", () => {
    const vars = buildCandidateEmailVariables({ candidate });
    expect(vars.user_name).toBe("");
    expect(vars.user_email).toBe("");
    expect(vars.user_phone).toBe("");
    expect(vars.pipeline_stage).toBe("");
  });

  it("mirrors candidate_email into receiver_email", () => {
    const vars = buildCandidateEmailVariables({ candidate });
    expect(vars.receiver_email).toBe("an@candidate.test");
    expect(vars.receiver_email).toBe(vars.candidate_email);
  });

  it("fills user_name/user_email/user_phone from senderUser and pipeline_stage from the given label", () => {
    const vars = buildCandidateEmailVariables({
      candidate,
      senderUser: { name: "Nguyen Van A", email: "a@smart-hire.test", phone: "0900000000" },
      pipelineStage: "Interview",
    });
    expect(vars.user_name).toBe("Nguyen Van A");
    expect(vars.user_email).toBe("a@smart-hire.test");
    expect(vars.user_phone).toBe("0900000000");
    expect(vars.pipeline_stage).toBe("Interview");
  });
});
