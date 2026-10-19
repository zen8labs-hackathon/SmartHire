import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_WORKING_HOURS,
  getSetting,
  getWorkingHours,
  setWorkingHours,
  upsertSetting,
} from "@/lib/db/company-settings";

function fakeDb(rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query };
}

describe("getSetting", () => {
  it("selects by key", async () => {
    const db = fakeDb([]);
    expect(await getSetting(db, "k")).toBeNull();
    expect(db.query).toHaveBeenCalledWith(
      `SELECT * FROM company_settings WHERE key = $1`,
      ["k"],
    );
  });
});

describe("upsertSetting", () => {
  it("serializes the value as jsonb and upserts on key", async () => {
    const row = { key: "k", value: { a: 1 } };
    const db = fakeDb([row]);
    expect(await upsertSetting(db, "k", { a: 1 }, "u1")).toEqual(row);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("VALUES ($1, $2::jsonb, $3)");
    expect(sql).toContain("ON CONFLICT (key) DO UPDATE");
    expect(values).toEqual(["k", '{"a":1}', "u1"]);
  });
});

describe("working hours", () => {
  it("falls back to defaults when the row is missing", async () => {
    expect(await getWorkingHours(fakeDb([]))).toEqual(DEFAULT_WORKING_HOURS);
  });

  it("returns the stored value", async () => {
    const value = { start: 480, end: 1020, days: [1, 2, 3] };
    expect(await getWorkingHours(fakeDb([{ key: "working_hours", value }]))).toEqual(
      value,
    );
  });

  it("setWorkingHours writes the working_hours key", async () => {
    const value = { start: 480, end: 1020, days: [1] };
    const db = fakeDb([{ key: "working_hours", value }]);
    expect(await setWorkingHours(db, value, "u1")).toEqual(value);
    expect(db.query.mock.calls[0][1][0]).toBe("working_hours");
  });
});
