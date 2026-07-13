import { describe, expect, it, vi } from "vitest";

import {
  createRefreshToken,
  getActiveRefreshTokenByHash,
  revokeAllRefreshTokensForUser,
  revokeRefreshTokenByHash,
} from "@/lib/db/refresh-tokens";

function fakeDb(rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query };
}

describe("createRefreshToken", () => {
  it("inserts with all fields and returns the row", async () => {
    const row = { id: "rt-1", user_id: "u-1", token_hash: "h" };
    const db = fakeDb([row]);
    const expiresAt = new Date("2026-08-01T00:00:00Z");

    const result = await createRefreshToken(db, {
      userId: "u-1",
      tokenHash: "h",
      expiresAt,
      userAgent: "vitest",
      ip: "127.0.0.1",
    });

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO refresh_tokens"),
      ["u-1", "h", expiresAt, "vitest", "127.0.0.1"],
    );
  });

  it("defaults optional fields to null", async () => {
    const db = fakeDb([{}]);
    await createRefreshToken(db, {
      userId: "u-1",
      tokenHash: "h",
      expiresAt: new Date(),
    });
    const [, values] = db.query.mock.calls[0];
    expect(values[3]).toBeNull();
    expect(values[4]).toBeNull();
  });
});

describe("getActiveRefreshTokenByHash", () => {
  it("only matches non-revoked, non-expired rows", async () => {
    const row = { id: "rt-1", token_hash: "h" };
    const db = fakeDb([row]);

    const result = await getActiveRefreshTokenByHash(db, "h");

    expect(result).toEqual(row);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("revoked_at IS NULL");
    expect(sql).toContain("expires_at > now()");
    expect(values).toEqual(["h"]);
  });

  it("returns null when no active token matches", async () => {
    const db = fakeDb([]);
    expect(await getActiveRefreshTokenByHash(db, "missing")).toBeNull();
  });
});

describe("revokeRefreshTokenByHash", () => {
  it("sets revoked_at for the matching active token", async () => {
    const db = fakeDb([]);
    await revokeRefreshTokenByHash(db, "h");
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("SET revoked_at = now()"),
      ["h"],
    );
  });
});

describe("revokeAllRefreshTokensForUser", () => {
  it("revokes every active token for the user", async () => {
    const db = fakeDb([]);
    await revokeAllRefreshTokensForUser(db, "u-1");
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("WHERE user_id = $1 AND revoked_at IS NULL");
    expect(values).toEqual(["u-1"]);
  });
});
