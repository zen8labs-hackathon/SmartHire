import { describe, expect, it } from "vitest";
import { activeCooldown } from "./cooldown";

const now = new Date("2026-11-05T00:00:00Z");
describe("activeCooldown", () => {
  it("needs an open application", () => {
    expect(activeCooldown([{ id: "a", ended_at: "2026-10-01T00:00:00Z" }], now)).toBeNull();
  });
  it("returns the most recent ended app inside 6 x 30.44 days", () => {
    const apps = [
      { id: "open", ended_at: null },
      { id: "old", ended_at: "2026-01-01T00:00:00Z" },
      { id: "a", ended_at: "2026-08-01T00:00:00Z" },
      { id: "b", ended_at: "2026-09-01T00:00:00Z" },
    ];
    expect(activeCooldown(apps, now)?.id).toBe("b");
  });
  it("ignores apps past the window", () => {
    const apps = [{ id: "open", ended_at: null }, { id: "old", ended_at: "2026-05-01T00:00:00Z" }];
    expect(activeCooldown(apps, now)).toBeNull();
  });
});
