import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/config/client", () => ({
  getPool: vi.fn(),
  withTransaction: vi.fn(),
}));

import {
  canCreateInChapter,
  draftTitle,
  isTempJdKey,
} from "./create-position";
import { patchToJobUpdate } from "./process-jd";

describe("canCreateInChapter", () => {
  it("lets HR pick any chapter", () => {
    expect(canCreateInChapter({ isHr: true, headedChapterIds: [] }, "c1")).toBe(true);
  });
  it("locks chapter heads to their own chapters", () => {
    const a = { isHr: false, headedChapterIds: ["c1"] };
    expect(canCreateInChapter(a, "c1")).toBe(true);
    expect(canCreateInChapter(a, "c2")).toBe(false);
  });
});

describe("isTempJdKey", () => {
  it("accepts jd/ keys and rejects others", () => {
    expect(isTempJdKey("jd/abc.pdf")).toBe(true);
    expect(isTempJdKey("job_descriptions/x/a.pdf")).toBe(false);
    expect(isTempJdKey("jd/../secret")).toBe(false);
    expect(isTempJdKey(42)).toBe(false);
  });
});

describe("draftTitle", () => {
  it("uses the blank title or the file name", () => {
    expect(draftTitle(null)).toBe("Untitled position");
    expect(draftTitle("backend.pdf")).toBe("New position · backend.pdf");
  });
});

describe("patchToJobUpdate", () => {
  it("maps to camelCase, skips employment_status and empties", () => {
    const { update, filled } = patchToJobUpdate({
      position: "Backend Engineer",
      employment_status: "Intern",
      work_location: "Hanoi",
      reporting: "  ",
    });
    expect(update).toEqual({ position: "Backend Engineer", workLocation: "Hanoi" });
    expect(filled).toBe(2);
  });
});
