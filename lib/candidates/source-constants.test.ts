import { describe, expect, it } from "vitest";

import { fileSourceToApplicationSource } from "./source-constants";

describe("fileSourceToApplicationSource", () => {
  it("keeps a known source key as-is with no description", () => {
    expect(fileSourceToApplicationSource("LinkedIn")).toEqual({
      source: "LinkedIn",
      sourceOther: null,
    });
  });

  it("treats free text as an Other description", () => {
    expect(fileSourceToApplicationSource("  Career fair ")).toEqual({
      source: "Other",
      sourceOther: "Career fair",
    });
  });

  it("maps a bare 'Other' to Other with no description", () => {
    expect(fileSourceToApplicationSource("Other")).toEqual({
      source: "Other",
      sourceOther: null,
    });
  });

  it("leaves both unset for empty or missing input so the column default applies", () => {
    expect(fileSourceToApplicationSource(null)).toEqual({});
    expect(fileSourceToApplicationSource("   ")).toEqual({});
  });
});
