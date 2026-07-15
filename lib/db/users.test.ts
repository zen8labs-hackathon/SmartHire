import { describe, expect, it, vi } from "vitest";

import {
  createUser,
  getPublicUserByEmail,
  getPublicUserById,
  getUserByEmailForAuth,
  getUserByIdForAuth,
  getUserBySsoIdentity,
  getUsersByEmails,
  getUsersByIds,
  linkSsoIdentity,
  listPublicUsers,
  searchUsersByEmail,
  softDeleteUser,
  updateUser,
  usernameExists,
} from "@/lib/db/users";

function fakeDb(rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query };
}

describe("getUserByEmailForAuth", () => {
  it("selects full row (including password_hash) by case-insensitive email", async () => {
    const row = { id: "u-1", email: "a@b.com", password_hash: "hash" };
    const db = fakeDb([row]);

    const result = await getUserByEmailForAuth(db, "A@B.com");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `SELECT * FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
      ["A@B.com"],
    );
  });

  it("returns null when no row matches", async () => {
    const db = fakeDb([]);
    expect(await getUserByEmailForAuth(db, "missing@x.com")).toBeNull();
  });
});

describe("getUserByIdForAuth", () => {
  it("selects full row by id", async () => {
    const row = { id: "u-1", password_hash: "hash" };
    const db = fakeDb([row]);

    const result = await getUserByIdForAuth(db, "u-1");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`,
      ["u-1"],
    );
  });
});

describe("getPublicUserById / getPublicUserByEmail", () => {
  it("never selects password_hash", async () => {
    const db = fakeDb([]);
    await getPublicUserById(db, "u-1");
    const [sql] = db.query.mock.calls[0];
    expect(sql).not.toContain("password_hash");
    expect(sql).toContain("id, email, username, role, created_at, deleted_at");
  });

  it("looks up by case-insensitive email", async () => {
    const db = fakeDb([]);
    await getPublicUserByEmail(db, "A@B.com");
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("lower(email) = lower($1)");
    expect(values).toEqual(["A@B.com"]);
  });
});

describe("listPublicUsers", () => {
  it("excludes soft-deleted rows and orders by email", async () => {
    const db = fakeDb([]);
    await listPublicUsers(db);
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("WHERE deleted_at IS NULL");
    expect(sql).toContain("ORDER BY email ASC");
    expect(sql).not.toContain("password_hash");
  });
});

describe("getUsersByIds", () => {
  it("returns [] without querying when given no ids", async () => {
    const db = fakeDb([]);
    const result = await getUsersByIds(db, []);
    expect(result).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("looks up by id, excluding soft-deleted", async () => {
    const db = fakeDb([]);
    await getUsersByIds(db, ["u-1", "u-2"]);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("WHERE deleted_at IS NULL AND id = ANY($1::uuid[])");
    expect(values).toEqual([["u-1", "u-2"]]);
  });
});

describe("getUsersByEmails", () => {
  it("returns [] without querying when given no emails", async () => {
    const db = fakeDb([]);
    const result = await getUsersByEmails(db, []);
    expect(result).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("lowercases emails and excludes soft-deleted", async () => {
    const db = fakeDb([]);
    await getUsersByEmails(db, ["A@B.com", "C@D.com"]);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("WHERE deleted_at IS NULL AND lower(email) = ANY($1::text[])");
    expect(values).toEqual([["a@b.com", "c@d.com"]]);
  });
});

describe("searchUsersByEmail", () => {
  it("searches by case-insensitive substring, excludes soft-deleted, caps at limit", async () => {
    const db = fakeDb([]);
    await searchUsersByEmail(db, "jdoe", 25);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("WHERE deleted_at IS NULL AND email ILIKE");
    expect(sql).not.toContain("password_hash");
    expect(values).toEqual(["jdoe", 25]);
  });
});
describe("usernameExists", () => {
  it("returns true when a matching non-deleted username exists", async () => {
    const db = fakeDb([{ exists: true }]);
    expect(await usernameExists(db, "jdoe")).toBe(true);
  });

  it("returns false when no match", async () => {
    const db = fakeDb([{ exists: false }]);
    expect(await usernameExists(db, "jdoe")).toBe(false);
  });
});

describe("createUser", () => {
  it("defaults role to none when omitted", async () => {
    const row = { id: "u-1", email: "a@b.com", username: "a", role: "none" };
    const db = fakeDb([row]);

    const result = await createUser(db, { email: "a@b.com", username: "a" });

    expect(result).toEqual(row);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("COALESCE($3::profile_role, 'none')");
    expect(values).toEqual(["a@b.com", "a", null, null]);
  });

  it("passes through role and passwordHash when provided", async () => {
    const db = fakeDb([{}]);
    await createUser(db, {
      email: "a@b.com",
      username: "a",
      role: "hr",
      passwordHash: "hashed",
    });
    const [, values] = db.query.mock.calls[0];
    expect(values).toEqual(["a@b.com", "a", "hr", "hashed"]);
  });
});

describe("updateUser", () => {
  it("updates only provided fields", async () => {
    const row = { id: "u-1", role: "hr" };
    const db = fakeDb([row]);

    const result = await updateUser(db, "u-1", { role: "hr" });

    expect(result).toEqual(row);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("SET role = $2");
    expect(sql).not.toContain("password_hash = ");
    expect(values).toEqual(["u-1", "hr"]);
  });

  it("returns the current row without writing when patch is empty", async () => {
    const row = { id: "u-1" };
    const db = fakeDb([row]);

    const result = await updateUser(db, "u-1", {});

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `SELECT id, email, username, role, created_at, deleted_at FROM users WHERE id = $1 AND deleted_at IS NULL`,
      ["u-1"],
    );
  });
});

describe("linkSsoIdentity", () => {
  it("updates only an unlinked, non-deleted row matched by email", async () => {
    const row = { id: "u-1", email: "a@b.com", sso_provider: "azure_ad", sso_subject_id: "obj-1" };
    const db = fakeDb([row]);

    const result = await linkSsoIdentity(db, {
      email: "A@B.com",
      provider: "azure_ad",
      subjectId: "obj-1",
    });

    expect(result).toEqual(row);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("WHERE lower(email) = lower($3) AND sso_provider IS NULL AND deleted_at IS NULL");
    expect(values).toEqual(["azure_ad", "obj-1", "A@B.com"]);
  });

  it("returns null when no row matches", async () => {
    const db = fakeDb([]);
    const result = await linkSsoIdentity(db, {
      email: "nobody@b.com",
      provider: "azure_ad",
      subjectId: "obj-2",
    });
    expect(result).toBeNull();
  });
});

describe("getUserBySsoIdentity", () => {
  it("looks up by provider + subject id", async () => {
    const row = { id: "u-1", sso_provider: "azure_ad", sso_subject_id: "obj-1" };
    const db = fakeDb([row]);

    const result = await getUserBySsoIdentity(db, "azure_ad", "obj-1");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(expect.any(String), ["azure_ad", "obj-1"]);
  });

  it("returns null when no row matches", async () => {
    const db = fakeDb([]);
    const result = await getUserBySsoIdentity(db, "azure_ad", "missing");
    expect(result).toBeNull();
  });
});

describe("softDeleteUser", () => {
  it("sets deleted_at and returns the row", async () => {
    const row = { id: "u-1", deleted_at: new Date() };
    const db = fakeDb([row]);

    const result = await softDeleteUser(db, "u-1");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("SET deleted_at = now()"),
      ["u-1"],
    );
  });
});
