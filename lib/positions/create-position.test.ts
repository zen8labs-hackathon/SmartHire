import { describe, expect, it } from "vitest";
import {
  createPositionState,
  validateHeadcount,
  validateJdFile,
} from "./create-position";

describe("D-02-4 decision table", () => {
  it("R1 file + valid headcount", () => {
    expect(createPositionState({ fileValid: true, headcountValid: true })).toEqual({
      uploadEnabled: true, blankLinkEnabled: true, showHeadcountError: false,
    });
  });
  it("R2 file + invalid headcount", () => {
    expect(createPositionState({ fileValid: true, headcountValid: false })).toEqual({
      uploadEnabled: false, blankLinkEnabled: false, showHeadcountError: true,
    });
  });
  it("R3 no file + valid headcount", () => {
    expect(createPositionState({ fileValid: false, headcountValid: true })).toEqual({
      uploadEnabled: false, blankLinkEnabled: true, showHeadcountError: false,
    });
  });
  it("R4 no file + invalid headcount", () => {
    expect(createPositionState({ fileValid: false, headcountValid: false })).toEqual({
      uploadEnabled: false, blankLinkEnabled: false, showHeadcountError: true,
    });
  });
});

describe("validateHeadcount", () => {
  it.each(["0", "-1", "1.5", "", "abc"])("rejects %s", (v) => {
    expect(validateHeadcount(v).error).toBe("Enter a whole number, 1 or more");
  });
  it("rejects 51", () => {
    expect(validateHeadcount("51").error).toBe("Maximum 50 per position");
  });
  it("accepts 1 and 50", () => {
    expect(validateHeadcount("1").value).toBe(1);
    expect(validateHeadcount(50).value).toBe(50);
  });
});

describe("validateJdFile", () => {
  it("accepts pdf/docx under 10MB", () => {
    expect(validateJdFile({ name: "a.PDF", size: 100 })).toBeNull();
    expect(validateJdFile({ name: "a.docx", size: 100 })).toBeNull();
  });
  it("blocks png and txt by format", () => {
    expect(validateJdFile({ name: "a.png", size: 1 })).toMatch(/PDF or DOCX/);
    expect(validateJdFile({ name: "a.txt", size: 1 })).toMatch(/PDF or DOCX/);
  });
  it("blocks 12MB by size", () => {
    expect(validateJdFile({ name: "a.pdf", size: 12 * 1024 * 1024 })).toMatch(/10 MB/);
  });
});
