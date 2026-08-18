import { describe, expect, it, vi } from "vitest";

import {
  createCalendarSyncPending,
  getCalendarSyncByScheduleId,
  listCalendarSyncsByScheduleIds,
  listRetryableCalendarSyncs,
  markCalendarSyncCancelled,
  markCalendarSyncFailed,
  markCalendarSyncSuccess,
} from "@/lib/db/candidate-schedule-calendar-syncs";

function fakeDb(rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query };
}

describe("getCalendarSyncByScheduleId", () => {
  it("selects by schedule_id", async () => {
    const row = { id: "sync-1", schedule_id: "sch-1" };
    const db = fakeDb([row]);
    const result = await getCalendarSyncByScheduleId(db, "sch-1");
    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE schedule_id = $1"),
      ["sch-1"],
    );
  });

  it("returns null when no row exists", async () => {
    const db = fakeDb([]);
    expect(await getCalendarSyncByScheduleId(db, "sch-1")).toBeNull();
  });
});

describe("listCalendarSyncsByScheduleIds", () => {
  it("short-circuits on an empty id list without querying", async () => {
    const db = fakeDb([]);
    const result = await listCalendarSyncsByScheduleIds(db, []);
    expect(result).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("queries with ANY($1::bigint[])", async () => {
    const db = fakeDb([]);
    await listCalendarSyncsByScheduleIds(db, ["sch-1", "sch-2"]);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("schedule_id = ANY($1::bigint[])"),
      [["sch-1", "sch-2"]],
    );
  });
});

describe("createCalendarSyncPending", () => {
  it("upserts to status='pending' on conflict, preserving graph_event_id", async () => {
    const row = { id: "sync-1", schedule_id: "sch-1", status: "pending" };
    const db = fakeDb([row]);
    const result = await createCalendarSyncPending(db, "sch-1");
    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT (schedule_id) DO UPDATE SET status = 'pending'"),
      ["sch-1"],
    );
  });
});

describe("markCalendarSyncSuccess", () => {
  it("sets status='synced' with the graph event id and optional warning", async () => {
    const db = fakeDb([]);
    await markCalendarSyncSuccess(db, "sync-1", { graphEventId: "evt-1", warning: "skipped 1" });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'synced'"),
      ["sync-1", "evt-1", "skipped 1"],
    );
  });
});

describe("markCalendarSyncFailed", () => {
  it("increments retry_count and records the error", async () => {
    const db = fakeDb([]);
    await markCalendarSyncFailed(db, "sync-1", "Graph error");
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("retry_count = retry_count + 1"),
      ["sync-1", "Graph error"],
    );
  });
});

describe("markCalendarSyncCancelled", () => {
  it("only updates rows not already cancelled", async () => {
    const db = fakeDb([]);
    await markCalendarSyncCancelled(db, "sch-1");
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("status != 'cancelled'"),
      ["sch-1"],
    );
  });
});

describe("listRetryableCalendarSyncs", () => {
  it("filters to failed rows under the retry cap", async () => {
    const db = fakeDb([]);
    await listRetryableCalendarSyncs(db, 3);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'failed' AND retry_count < $1"),
      [3],
    );
  });
});
