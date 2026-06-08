import { describe, expect, it } from "vitest";

import { looksLikePdfBinary } from "@/lib/jd/extract-document-text";

describe("looksLikePdfBinary", () => {
  it("detects raw PDF header markup", () => {
    expect(looksLikePdfBinary("%PDF-1.7\n%\n1 0 obj")).toBe(true);
  });

  it("detects PDF stream blocks", () => {
    expect(
      looksLikePdfBinary("4 0 obj\n<</Filter/FlateDecode/Length 3471>>\nstream\nx"),
    ).toBe(true);
  });

  it("accepts normal job description text", () => {
    expect(
      looksLikePdfBinary(
        "Position: AI Engineer\nDepartment: Solutions\nKEY RESPONSIBILITIES\n- Build APIs",
      ),
    ).toBe(false);
  });
});
