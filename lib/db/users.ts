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

/** `users.username` requires `^[a-z0-9_]{3,30}$` -- same email-local-part fallback the old Supabase `handle_new_user` trigger used. */
export function deriveUsernameCandidate(email: string): string {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  const sanitized = local.replace(/[^a-z0-9_]/g, "");
  const base =
    sanitized.length >= 3 ? sanitized : (sanitized + "user").slice(0, 3);
  return base.slice(0, 30);
}

/** Appends a numeric suffix to `deriveUsernameCandidate(email)` until it finds one not already taken. */
export async function generateUniqueUsername(
  db: QueryExecutor,
  email: string,
): Promise<string> {
  const base = deriveUsernameCandidate(email);
  for (let suffix = 1; suffix <= 1000; suffix += 1) {
    const candidate =
      suffix === 1
        ? base
        : `${base.slice(0, Math.max(1, 30 - String(suffix).length))}${suffix}`;
    if (!(await usernameExists(db, candidate))) {
      return candidate;
    }
  }
  throw new Error(
    "Could not generate a unique username -- too many collisions.",
  );
}

export async function createUser(
  db: QueryExecutor,
  input: CreateUserInput,
): Promise<PublicUserRow> {
  const { rows } = await db.query<PublicUserRow>(
    `INSERT INTO users (email, username, role, password_hash)
     VALUES ($1, $2, COALESCE($3::profile_role, 'none'), $4)
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

/**
 * Links a Microsoft/Azure AD identity to an already-invited user row. Only
 * matches a row that has no SSO identity yet (`sso_provider IS NULL`), so an
 * admin/HR-created account keeps whatever role it was given. Returns null
 * when no such row exists (either no user with that email at all, or one
 * that already has a different SSO identity) -- the caller then falls back
 * to `createSsoUser` for a first-time signup with no pre-created row.
 */
export async function linkSsoIdentity(
  db: QueryExecutor,
  input: { email: string; provider: string; subjectId: string },
): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(
    `UPDATE users
     SET sso_provider = $1, sso_subject_id = $2
     WHERE lower(email) = lower($3) AND sso_provider IS NULL AND deleted_at IS NULL
     RETURNING *`,
    [input.provider, input.subjectId, input.email],
  );
  return rows[0] ?? null;
}

/**
 * Creates a brand-new user for a first-time SSO login whose email doesn't
 * match any admin/HR-invited row. SSO-only account (no password_hash).
 * Relies on the caller to catch a unique-violation on `email` (see
 * `isUniqueViolation`) for the race where a row with this email already
 * exists but is tied to a different SSO identity -- that case must not
 * silently take over the existing account.
 */
export async function createSsoUser(
  db: QueryExecutor,
  input: {
    email: string;
    username: string;
    role: ProfileRole;
    provider: string;
    subjectId: string;
  },
): Promise<UserRow> {
  const { rows } = await db.query<UserRow>(
    `INSERT INTO users (email, username, role, sso_provider, sso_subject_id)
     VALUES ($1, $2, $3::profile_role, $4, $5)
     RETURNING *`,
    [input.email, input.username, input.role, input.provider, input.subjectId],
  );
  return rows[0];
}

/** Return-visit lookup for a user already linked to an SSO identity. */
export async function getUserBySsoIdentity(
  db: QueryExecutor,
  provider: string,
  subjectId: string,
): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(
    `SELECT * FROM users WHERE sso_provider = $1 AND sso_subject_id = $2 AND deleted_at IS NULL`,
    [provider, subjectId],
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
