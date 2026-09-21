import { describe, expect, it } from "vitest";

import { cvFileTypeLabel } from "./cv-file-type";

describe("cvFileTypeLabel", () => {
  it("labels PDF, DOCX and DOC from the mime type", () => {
    expect(cvFileTypeLabel({ fileName: null, mimeType: "application/pdf" })).toBe("PDF");
    expect(
      cvFileTypeLabel({
        fileName: null,
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).toBe("DOCX");
    expect(cvFileTypeLabel({ fileName: null, mimeType: "application/msword" })).toBe("DOC");
  });

  it("trusts the mime type over a misleading file name", () => {
    expect(cvFileTypeLabel({ fileName: "resume.docx", mimeType: "application/pdf" })).toBe("PDF");
  });

  it("falls back to the file-name extension when the mime is missing or generic", () => {
    expect(cvFileTypeLabel({ fileName: "cv.PDF", mimeType: null })).toBe("PDF");
    expect(cvFileTypeLabel({ fileName: "cv.rtf", mimeType: "application/octet-stream" })).toBe("RTF");
    expect(cvFileTypeLabel({ fileName: "my.cv.final.docx", mimeType: "" })).toBe("DOCX");
  });

  it("ignores implausible extensions", () => {
    expect(cvFileTypeLabel({ fileName: "noextension", mimeType: null })).toBe("FILE");
    expect(cvFileTypeLabel({ fileName: ".hidden", mimeType: null })).toBe("FILE");
    expect(cvFileTypeLabel({ fileName: "trailingdot.", mimeType: null })).toBe("FILE");
    expect(cvFileTypeLabel({ fileName: "a.averylongextension", mimeType: null })).toBe("FILE");
    expect(cvFileTypeLabel({ fileName: "a.b c", mimeType: null })).toBe("FILE");
  });

  it("returns FILE with no information at all", () => {
    expect(cvFileTypeLabel({ fileName: null, mimeType: null })).toBe("FILE");
  });
});
