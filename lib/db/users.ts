import type { QueryExecutor } from "@/lib/db/config/client";
import { buildSetClause } from "@/lib/db/query-helpers";

export type ProfileRole = "admin" | "hr" | "recruiter" | "none";

/**
 * Full row including `password_hash` -- only `lib/auth/*` should ever select
 * this shape (password verification). Every other caller should use
 * `PublicUserRow` / `getPublicUserById` so a credential never ends up in a
 * server action response or a list rendered to the browser.
 */
export type UserRow = {
  id: string;
  email: string;
  username: string;
  role: ProfileRole;
  password_hash: string | null;
  sso_provider: string | null;
  sso_subject_id: string | null;
  created_at: Date;
  deleted_at: Date | null;
};

export type PublicUserRow = Omit<
  UserRow,
  "password_hash" | "sso_provider" | "sso_subject_id"
>;

const PUBLIC_COLUMNS = "id, email, username, role, created_at, deleted_at";

export type CreateUserInput = {
  email: string;
  username: string;
  role?: ProfileRole;
  passwordHash?: string | null;
};

export type UpdateUserInput = {
  username?: string;
  role?: ProfileRole;
  passwordHash?: string | null;
};

/** Includes `password_hash` -- for `lib/auth/*` password verification only. */
export async function getUserByEmailForAuth(
  db: QueryExecutor,
  email: string,
): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(
    `SELECT * FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
    [email],
  );
  return rows[0] ?? null;
}

/** Includes `password_hash` -- for `lib/auth/*` session verification (re-checking role on refresh) only. */
export async function getUserByIdForAuth(
  db: QueryExecutor,
  id: string,
): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(
    `SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getPublicUserById(
  db: QueryExecutor,
  id: string,
): Promise<PublicUserRow | null> {
  const { rows } = await db.query<PublicUserRow>(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getPublicUserByEmail(
  db: QueryExecutor,
  email: string,
): Promise<PublicUserRow | null> {
  const { rows } = await db.query<PublicUserRow>(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
    [email],
  );
  return rows[0] ?? null;
}

export async function listPublicUsers(
  db: QueryExecutor,
): Promise<PublicUserRow[]> {
  const { rows } = await db.query<PublicUserRow>(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE deleted_at IS NULL ORDER BY email ASC`,
  );
  return rows;
}

/** Bulk id lookup -- resolves a list of user ids to user rows in one round trip. */
export async function getUsersByIds(
  db: QueryExecutor,
  ids: string[],
): Promise<PublicUserRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await db.query<PublicUserRow>(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE deleted_at IS NULL AND id = ANY($1::uuid[])`,
    [ids],
  );
  return rows;
}

/** Bulk case-insensitive exact-email lookup -- resolves a list of emails to user rows in one round trip. */
export async function getUsersByEmails(
  db: QueryExecutor,
  emails: string[],
): Promise<PublicUserRow[]> {
  if (emails.length === 0) return [];
  const { rows } = await db.query<PublicUserRow>(
    `SELECT ${PUBLIC_COLUMNS} FROM users
     WHERE deleted_at IS NULL AND lower(email) = ANY($1::text[])`,
    [emails.map((e) => e.toLowerCase())],
  );
  return rows;
}

/** Case-insensitive email substring search (HR autocomplete), capped at `limit`. */
export async function searchUsersByEmail(
  db: QueryExecutor,
  query: string,
  limit: number,
): Promise<PublicUserRow[]> {
  const { rows } = await db.query<PublicUserRow>(
    `SELECT ${PUBLIC_COLUMNS} FROM users
     WHERE deleted_at IS NULL AND email ILIKE '%' || $1 || '%'
     ORDER BY email ASC
     LIMIT $2`,
    [query, limit],
  );
  return rows;
}
/** True if `username` (case-insensitive) is already taken by a non-deleted user. */
export async function usernameExists(
  db: QueryExecutor,
  username: string,
): Promise<boolean> {
  const { rows } = await db.query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM users WHERE lower(username) = lower($1) AND deleted_at IS NULL) AS exists`,
    [username],
  );
  return rows[0]?.exists === true;
}

export async function createUser(
  db: QueryExecutor,
  input: CreateUserInput,
): Promise<PublicUserRow> {
  const { rows } = await db.query<PublicUserRow>(
    `INSERT INTO users (email, username, role, password_hash)
     VALUES ($1, $2, COALESCE($3, 'none'), $4)
     RETURNING ${PUBLIC_COLUMNS}`,
    [
      input.email,
      input.username,
      input.role ?? null,
      input.passwordHash ?? null,
    ],
  );
  return rows[0];
}

export async function updateUser(
  db: QueryExecutor,
  id: string,
  patch: UpdateUserInput,
): Promise<PublicUserRow | null> {
  const { clause, values } = buildSetClause(
    {
      username: patch.username,
      role: patch.role,
      password_hash: patch.passwordHash,
    },
    2,
  );
  if (!clause) return getPublicUserById(db, id);

  const { rows } = await db.query<PublicUserRow>(
    `UPDATE users
     SET ${clause}
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING ${PUBLIC_COLUMNS}`,
    [id, ...values],
  );
  return rows[0] ?? null;
}

export async function softDeleteUser(
  db: QueryExecutor,
  id: string,
): Promise<PublicUserRow | null> {
  const { rows } = await db.query<PublicUserRow>(
    `UPDATE users
     SET deleted_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING ${PUBLIC_COLUMNS}`,
    [id],
  );
  return rows[0] ?? null;
}
