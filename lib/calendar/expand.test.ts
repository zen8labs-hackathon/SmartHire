import { describe, expect, it } from "vitest";

import type { BusyBlockRow } from "@/lib/db/busy-blocks";
import {
  busyBlockFromRow,
  expandBusyBlock,
  expandBusyBlocks,
  type BusyBlockInput,
} from "@/lib/calendar/expand";

function block(over: Partial<BusyBlockInput> = {}): BusyBlockInput {
  return {
    id: "b1",
    ownerId: "u1",
    startDate: "2026-10-20", // Tuesday
    allDay: false,
    fromMin: 540,
    toMin: 600,
    repeat: "none",
    untilDate: null,
    note: null,
    removedDates: [],
    days: [],
    ...over,
  };
}

const dates = (b: BusyBlockInput, from: string, to: string) =>
  expandBusyBlock(b, from, to).map((o) => o.date);

describe("expandBusyBlock", () => {
  it("returns a single occurrence for repeat none inside the range", () => {
    expect(dates(block(), "2026-10-19", "2026-10-25")).toEqual(["2026-10-20"]);
  });

  it("returns nothing when a one-off block is outside the range", () => {
    expect(dates(block(), "2026-10-21", "2026-10-25")).toEqual([]);
  });

  it("expands weekdays and skips weekends", () => {
    const b = block({ repeat: "weekdays", untilDate: "2026-10-27" });
    expect(dates(b, "2026-10-19", "2026-11-01")).toEqual([
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-26",
      "2026-10-27",
    ]);
  });

  it("expands weekly on the picked weekdays", () => {
    const b = block({ repeat: "weekly", days: [1, 3], untilDate: "2026-11-02" });
    expect(dates(b, "2026-10-19", "2026-11-08")).toEqual(["2026-10-21", "2026-10-26", "2026-10-28", "2026-11-02"]);
  });

  it("expands weekly on the start weekday", () => {
    const b = block({ repeat: "weekly", untilDate: "2026-11-10" });
    expect(dates(b, "2026-10-01", "2026-12-31")).toEqual([
      "2026-10-20",
      "2026-10-27",
      "2026-11-03",
      "2026-11-10",
    ]);
  });

  it("clips to the requested range", () => {
    const b = block({ repeat: "weekly", untilDate: "2026-11-10" });
    expect(dates(b, "2026-10-26", "2026-11-04")).toEqual(["2026-10-27", "2026-11-03"]);
  });

  it("skips removed dates", () => {
    const b = block({
      repeat: "weekdays",
      untilDate: "2026-10-23",
      removedDates: ["2026-10-21"],
    });
    expect(dates(b, "2026-10-19", "2026-10-25")).toEqual([
      "2026-10-20",
      "2026-10-22",
      "2026-10-23",
    ]);
  });

  it("drops minutes for all-day blocks", () => {
    const [o] = expandBusyBlock(
      block({ allDay: true, fromMin: 540, toMin: 600 }),
      "2026-10-20",
      "2026-10-20",
    );
    expect(o).toMatchObject({ allDay: true, fromMin: null, toMin: null });
  });
});

describe("expandBusyBlocks", () => {
  it("merges and sorts by date then start minute", () => {
    const out = expandBusyBlocks(
      [
        block({ id: "late", startDate: "2026-10-21", fromMin: 600, toMin: 660 }),
        block({ id: "early", startDate: "2026-10-21", fromMin: 480, toMin: 510 }),
        block({ id: "allday", startDate: "2026-10-21", allDay: true }),
        block({ id: "first", startDate: "2026-10-20" }),
      ],
      "2026-10-19",
      "2026-10-25",
    );
    expect(out.map((o) => o.blockId)).toEqual(["first", "allday", "early", "late"]);
  });
});

describe("busyBlockFromRow", () => {
  it("maps pg dates to ISO strings", () => {
    const row: BusyBlockRow = {
      id: "b1",
      owner_id: "u1",
      start_date: new Date(2026, 9, 20),
      all_day: false,
      from_min: 540,
      to_min: 600,
      repeat: "weekly",
      until_date: new Date(2026, 10, 10),
      note: "Gym",
      removed_dates: [new Date(2026, 9, 27)],
      days: [],
      series_parent_id: null,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    };
    expect(busyBlockFromRow(row)).toEqual({
      id: "b1",
      ownerId: "u1",
      startDate: "2026-10-20",
      allDay: false,
      fromMin: 540,
      toMin: 600,
      repeat: "weekly",
      untilDate: "2026-11-10",
      note: "Gym",
      removedDates: ["2026-10-27"],
      days: [],
    });
  });
});
