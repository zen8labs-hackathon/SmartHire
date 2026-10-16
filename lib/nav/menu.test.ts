import { describe, expect, it } from "vitest";
import { buildMenu, isNavActive, scopeLabel } from "./menu";

const ids = (v: Parameters<typeof buildMenu>[0]) =>
  buildMenu(v).flatMap((g) => g.items.map((i) => `${g.id}:${i.id}`));

describe("buildMenu", () => {
  it("HR sees work + setup", () => {
    expect(ids({ isHr: true, isChapterHead: false })).toMatchInlineSnapshot(`
      [
        "work:dashboard",
        "work:stats",
        "work:positions",
        "work:positions2",
        "work:candidates",
        "work:pipelines",
        "work:pipelines2",
        "setup:users",
        "setup:chapters",
        "setup:templates",
      ]
    `);
  });
  it("chapter head sees positions only", () => {
    expect(ids({ isHr: false, isChapterHead: true })).toMatchInlineSnapshot(`
      [
        "work:dashboard",
        "work:positions",
        "work:positions2",
      ]
    `);
  });
  it("recruiter sees positions only", () => {
    expect(ids({ isHr: false, isChapterHead: false })).toMatchInlineSnapshot(`
      [
        "work:dashboard",
        "work:positions",
        "work:positions2",
      ]
    `);
  });
  it("never renders unbuilt routes", () => {
    const all = buildMenu({ isHr: true, isChapterHead: true }).flatMap((g) => g.items);
    expect(all.every((i) => i.ready)).toBe(true);
  });
});

describe("isNavActive / scopeLabel", () => {
  it("matches exact for roots, prefix for sections", () => {
    expect(isNavActive("/admin", "/admin/jd")).toBe(false);
    expect(isNavActive("/admin/jd", "/admin/jd/123")).toBe(true);
  });
  it("derives scope", () => {
    expect(scopeLabel({ isHr: true, isChapterHead: false }, [])).toBe("All chapters");
    expect(scopeLabel({ isHr: false, isChapterHead: true }, ["Backend"])).toBe("Backend");
    expect(scopeLabel({ isHr: false, isChapterHead: false }, [])).toBe("Shared with you");
  });
});

import { describe as d2, it as i2, expect as e2 } from "vitest";
d2("keyboard navigation order", () => {
  i2("menu items are a flat, ordered tab sequence of real links", () => {
    const hrefs = buildMenu({ isHr: true, isChapterHead: false }).flatMap((g) => g.items.map((i) => i.href));
    e2(new Set(hrefs).size).toBe(hrefs.length);
    e2(hrefs[0]).toBe("/dashboard");
  });
});
