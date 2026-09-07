import { describe, expect, it, vi } from "vitest";

import {
  deletePushSubscriptionByEndpoint,
  deletePushSubscriptionForUser,
  listPushSubscriptionsByUserIds,
  upsertPushSubscription,
} from "@/lib/db/push-subscriptions";

function fakeDb(rows: unknown[]) {
  const query = vi.fn().mockResolvedValueOnce({ rows });
  return { query };
}

describe("upsertPushSubscription", () => {
  it("upserts on the endpoint constraint, refreshing owner and keys", async () => {
    const db = fakeDb([{ id: "1" }]);

    await upsertPushSubscription(db, {
      userId: "user-1",
      endpoint: "https://push.example/abc",
      p256dh: "key",
      auth: "auth",
      userAgent: "Firefox",
    });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("ON CONFLICT (endpoint) DO UPDATE");
    expect(sql).toContain("user_id    = EXCLUDED.user_id");
    expect(sql).toContain("p256dh     = EXCLUDED.p256dh");
    expect(params).toEqual([
      "user-1",
      "https://push.example/abc",
      "key",
      "auth",
      "Firefox",
    ]);
  });

  it("defaults a missing user agent to null", async () => {
    const db = fakeDb([{ id: "1" }]);

    await upsertPushSubscription(db, {
      userId: "user-1",
      endpoint: "https://push.example/abc",
      p256dh: "key",
      auth: "auth",
    });

    const [, params] = db.query.mock.calls[0];
    expect(params[4]).toBeNull();
  });
});

describe("listPushSubscriptionsByUserIds", () => {
  it("returns early without querying for an empty id list", async () => {
    const db = fakeDb([]);

    const rows = await listPushSubscriptionsByUserIds(db, []);

    expect(rows).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("matches any of the given users in one query", async () => {
    const db = fakeDb([]);

    await listPushSubscriptionsByUserIds(db, ["a", "b"]);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("user_id = ANY($1::uuid[])");
    expect(params[0]).toEqual(["a", "b"]);
  });
});

describe("deletePushSubscriptionByEndpoint", () => {
  it("reports whether a row was removed", async () => {
    expect(
      await deletePushSubscriptionByEndpoint(fakeDb([{ id: "1" }]), "e"),
    ).toBe(true);
    expect(await deletePushSubscriptionByEndpoint(fakeDb([]), "e")).toBe(false);
  });
});

describe("deletePushSubscriptionForUser", () => {
  it("scopes the delete to the owning user", async () => {
    const db = fakeDb([]);

    await deletePushSubscriptionForUser(db, "user-1", "https://push.example/x");

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("endpoint = $1 AND user_id = $2");
    expect(params).toEqual(["https://push.example/x", "user-1"]);
  });
});
