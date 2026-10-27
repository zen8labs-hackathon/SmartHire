import { describe, expect, it } from "vitest";
import { MAX_BATCH_FILES, MAX_CV_BYTES } from "@/lib/candidates/upload-constants";
import { sourceFromFileSource, validateCvUploadBody } from "./cv-upload";

const f = (fileName: string, size = 100) => ({ fileName, size });

describe("validateCvUploadBody", () => {
  it("accepts pdf/docx and builds cv/ storage keys", () => {
    const r = validateCvUploadBody(
      { files: [f("a.PDF"), f("b.docx")], source: " LinkedIn " },
      () => "k",
    );
    expect(r).toMatchObject({ ok: true, source: "LinkedIn" });
    if (r.ok) {
      expect(r.files.map((x) => x.storageKey)).toEqual(["cv/k.pdf", "cv/k.docx"]);
      expect(r.files[0].mimeType).toBe("application/pdf");
    }
  });
  it("rejects empty, missing source, bad type, oversize, too many", () => {
    expect(validateCvUploadBody({ files: [], source: "x" }).ok).toBe(false);
    expect(validateCvUploadBody({ files: [f("a.pdf")] }).ok).toBe(false);
    expect(validateCvUploadBody({ files: [f("a.txt")], source: "x" }).ok).toBe(false);
    expect(
      validateCvUploadBody({ files: [f("a.pdf", MAX_CV_BYTES + 1)], source: "x" }).ok,
    ).toBe(false);
    expect(
      validateCvUploadBody({
        files: Array.from({ length: MAX_BATCH_FILES + 1 }, () => f("a.pdf")),
        source: "x",
      }).ok,
    ).toBe(false);
  });
});

describe("sourceFromFileSource", () => {
  it("maps known sources, others to Other + detail", () => {
    expect(sourceFromFileSource("LinkedIn")).toEqual({ source: "LinkedIn", sourceOther: null });
    expect(sourceFromFileSource("Referral")).toEqual({ source: "Other", sourceOther: "Referral" });
    expect(sourceFromFileSource(null)).toEqual({ source: "Other", sourceOther: null });
  });
});
