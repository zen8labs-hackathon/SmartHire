import { describe, expect, it } from "vitest";
import { formatNumber, searchKey, toNfc } from "./locale-format";

describe("locale-format", () => {
  it("normalises Vietnamese text to NFC", () => {
    const decomposed = "Nguyễn".normalize("NFD");
    expect(decomposed).not.toBe("Nguyễn");
    expect(toNfc(decomposed)).toBe("Nguyễn");
    expect(searchKey(` ${decomposed} `)).toBe("nguyễn");
  });

  it("formats numbers per locale", () => {
    expect(formatNumber(1234.5, "en")).toBe("1,234.5");
    expect(formatNumber(1234.5, "vi")).toBe("1.234,5");
  });
});
