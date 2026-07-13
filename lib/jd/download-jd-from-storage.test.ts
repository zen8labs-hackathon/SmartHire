import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/s3", () => ({
  downloadObject: vi.fn(),
}));

import { downloadObject } from "@/lib/storage/s3";
import {
  downloadJdFromStorage,
  mimeTypeFromStoragePath,
} from "@/lib/jd/download-jd-from-storage";

describe("mimeTypeFromStoragePath", () => {
  it("infers pdf/docx/txt from the extension", () => {
    expect(mimeTypeFromStoragePath("jd/a.pdf")).toBe("application/pdf");
    expect(mimeTypeFromStoragePath("jd/a.docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(mimeTypeFromStoragePath("jd/a.txt")).toBe("text/plain");
  });
});

describe("downloadJdFromStorage", () => {
  it("returns the buffer and resolved mime type on success", async () => {
    vi.mocked(downloadObject).mockResolvedValue(Buffer.from("%PDF-1.4"));
    const result = await downloadJdFromStorage("jd/a.pdf");
    expect("buffer" in result).toBe(true);
  });

  it("returns an error object when downloadObject rejects", async () => {
    vi.mocked(downloadObject).mockRejectedValue(new Error("not found"));
    const result = await downloadJdFromStorage("jd/missing.pdf");
    expect(result).toEqual({ error: "not found" });
  });
});
