import { describe, expect, it } from "vitest";

import {
  groupTextItemsIntoLines,
  guessNameFromPlainText,
  pickLikelyNameLine,
} from "./client-cv-extract";

function item(str: string, height: number, y: number, hasEOL: boolean) {
  return { str, height, transform: [1, 0, 0, 1, 0, y], hasEOL };
}

describe("groupTextItemsIntoLines", () => {
  it("merges items until hasEOL into one line, keeping the tallest height", () => {
    const lines = groupTextItemsIntoLines([
      item("Nguyen ", 18, 800, false),
      item("Van A", 18, 800, true),
      item("Backend Engineer", 10, 770, true),
    ]);
    expect(lines).toEqual([
      { text: "Nguyen Van A", height: 18, y: 800 },
      { text: "Backend Engineer", height: 10, y: 770 },
    ]);
  });

  it("drops blank lines", () => {
    const lines = groupTextItemsIntoLines([item("   ", 12, 800, true)]);
    expect(lines).toEqual([]);
  });
});

describe("pickLikelyNameLine", () => {
  it("picks the largest-font line in the top half of the page", () => {
    const lines = [
      { text: "CURRICULUM VITAE", height: 20, y: 820 },
      { text: "Nguyen Van A", height: 24, y: 800 },
      { text: "Backend Engineer", height: 12, y: 770 },
      { text: "Huge Footer Text", height: 40, y: 20 },
    ];
    expect(pickLikelyNameLine(lines, 850)).toBe("Nguyen Van A");
  });

  it("ignores lines that look like contact info or headers", () => {
    const lines = [
      { text: "jane.doe@example.com", height: 30, y: 800 },
      { text: "Resume", height: 28, y: 790 },
      { text: "Jane Doe", height: 18, y: 780 },
    ];
    expect(pickLikelyNameLine(lines, 850)).toBe("Jane Doe");
  });

  it("returns null when nothing plausible is in the top half", () => {
    const lines = [{ text: "Jane Doe", height: 18, y: 100 }];
    expect(pickLikelyNameLine(lines, 850)).toBeNull();
  });
});

describe("guessNameFromPlainText", () => {
  it("returns the first plausible non-empty line", () => {
    expect(guessNameFromPlainText("\n\nJane Doe\nSoftware Engineer\n")).toBe("Jane Doe");
  });

  it("skips a leading header line", () => {
    expect(guessNameFromPlainText("Curriculum Vitae\nJane Doe\n")).toBe("Jane Doe");
  });

  it("returns null when no line qualifies", () => {
    expect(guessNameFromPlainText("jane@example.com\n0912345678\n")).toBeNull();
  });
});
