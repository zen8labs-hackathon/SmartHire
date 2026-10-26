import { describe, expect, it, vi } from "vitest";

import {
  addBusyBlockRemovedDate,
  createBusyBlock,
  getBusyBlockById,
  listBusyBlocksByOwnersInRange,
  softDeleteBusyBlock,
  truncateBusyBlockSeries,
  updateBusyBlock,
} from "@/lib/db/busy-blocks";

function fakeDb(rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query };
}

describe("getBusyBlockById", () => {
  it("excludes soft-deleted rows", async () => {
    const db = fakeDb([]);
    expect(await getBusyBlockById(db, "b1")).toBeNull();
    expect(db.query).toHaveBeenCalledWith(
      `SELECT * FROM busy_blocks WHERE id = $1 AND deleted_at IS NULL`,
      ["b1"],
    );
  });
});

describe("listBusyBlocksByOwnersInRange", () => {
  it("returns [] without querying for no owners", async () => {
    const db = fakeDb([]);
    expect(await listBusyBlocksByOwnersInRange(db, [], "a", "b")).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("selects blocks overlapping the range", async () => {
    const db = fakeDb([]);
    await listBusyBlocksByOwnersInRange(db, ["u1"], "2026-10-19", "2026-10-25");
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("owner_id = ANY($1::uuid[])");
    expect(sql).toContain("start_date <= $3::date");
    expect(sql).toContain("COALESCE(until_date, start_date) >= $2::date");
    expect(sql).toContain("ORDER BY start_date ASC, from_min ASC NULLS FIRST");
    expect(values).toEqual([["u1"], "2026-10-19", "2026-10-25"]);
  });
});

describe("createBusyBlock", () => {
  it("defaults repeat to none and nulls optional fields", async () => {
    const db = fakeDb([{ id: "b1" }]);
    await createBusyBlock(db, {
      ownerId: "u1",
      startDate: "2026-10-20",
      fromMin: 540,
      toMin: 600,
    });
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("COALESCE($6, 'none')");
    expect(values).toEqual([
      "u1",
      "2026-10-20",
      false,
      540,
      600,
      null,
      null,
      null,
      null,
      [],
    ]);
  });

  it("drops times for all-day blocks", async () => {
    const db = fakeDb([{ id: "b1" }]);
    await createBusyBlock(db, {
      ownerId: "u1",
      startDate: "2026-10-20",
      allDay: true,
      fromMin: 540,
      toMin: 600,
      repeat: "weekly",
      untilDate: "2026-11-20",
      note: "Leave",
    });
    expect(db.query.mock.calls[0][1]).toEqual([
      "u1",
      "2026-10-20",
      true,
      null,
      null,
      "weekly",
      "2026-11-20",
      "Leave",
      null,
      [],
    ]);
  });
});

describe("updateBusyBlock", () => {
  it("updates only provided fields", async () => {
    const db = fakeDb([{ id: "b1" }]);
    await updateBusyBlock(db, "b1", { note: "x", untilDate: null });
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("SET until_date = $2, note = $3, updated_at = now()");
    expect(sql).toContain("WHERE id = $1 AND deleted_at IS NULL");
    expect(values).toEqual(["b1", null, "x"]);
  });

  it("reads the block back for an empty patch", async () => {
    const db = fakeDb([{ id: "b1" }]);
    expect(await updateBusyBlock(db, "b1", {})).toEqual({ id: "b1" });
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toContain("SELECT * FROM busy_blocks");
  });
});

describe("softDeleteBusyBlock", () => {
  it("reports whether a row was deleted", async () => {
    expect(await softDeleteBusyBlock(fakeDb([{ id: "b1" }]), "b1")).toBe(true);
    expect(await softDeleteBusyBlock(fakeDb([]), "b1")).toBe(false);
  });
});

describe("series edits", () => {
  it("addBusyBlockRemovedDate appends a date once", async () => {
    const db = fakeDb([]);
    await addBusyBlockRemovedDate(db, "b1", "2026-10-22");
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("$2::date = ANY(removed_dates)");
    expect(sql).toContain("array_append(removed_dates, $2::date)");
    expect(values).toEqual(["b1", "2026-10-22"]);
  });

  it("truncateBusyBlockSeries ends the series the day before", async () => {
    const db = fakeDb([]);
    expect(await truncateBusyBlockSeries(db, "b1", "2026-10-22")).toBeNull();
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("until_date = $2::date - 1");
    expect(sql).toContain("unnest(removed_dates)");
    expect(sql).toContain("repeat <> 'none'");
    expect(sql).toContain("start_date < $2::date");
    expect(values).toEqual(["b1", "2026-10-22"]);
  });
});
