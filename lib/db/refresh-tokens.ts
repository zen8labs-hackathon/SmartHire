import type { QueryExecutor } from "@/lib/db/config/client";

export type RefreshTokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  user_agent: string | null;
  ip: string | null;
};

export type CreateRefreshTokenInput = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
  ip?: string | null;
};

export async function createRefreshToken(
  db: QueryExecutor,
  input: CreateRefreshTokenInput,
): Promise<RefreshTokenRow> {
  const { rows } = await db.query<RefreshTokenRow>(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.userId,
      input.tokenHash,
      input.expiresAt,
      input.userAgent ?? null,
      input.ip ?? null,
    ],
  );
  return rows[0];
}

/** Only returns a row that is neither revoked nor past its expiry. */
export async function getActiveRefreshTokenByHash(
  db: QueryExecutor,
  tokenHash: string,
): Promise<RefreshTokenRow | null> {
  const { rows } = await db.query<RefreshTokenRow>(
    `SELECT * FROM refresh_tokens
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export async function revokeRefreshTokenByHash(
  db: QueryExecutor,
  tokenHash: string,
): Promise<void> {
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash],
  );
}

/** Revokes every active session for a user -- password change, account deletion, or admin-initiated logout. */
export async function revokeAllRefreshTokensForUser(
  db: QueryExecutor,
  userId: string,
): Promise<void> {
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
}
