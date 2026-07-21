import type { QueryExecutor } from "@/lib/db/config/client";

/**
 * SQL predicate (relative to a `jobs` alias `j` or bare `jobs` table) that is
 * true when `userId` may view the job via resource ACL:
 * - direct profile grant in `job_allowed_profiles`, OR
 * - chapter head of a chapter in `job_allowed_chapters`
 *
 * Chapter *members* (non-head) do not get access via chapter grant.
 */
export function jobAclVisibleSql(
  userIdParamIndex: number,
  jobIdColumn = "id",
): string {
  return `(
    EXISTS (
      SELECT 1 FROM job_allowed_profiles jap
      WHERE jap.job_id = ${jobIdColumn} AND jap.profile_id = $${userIdParamIndex}
    )
    OR EXISTS (
      SELECT 1
      FROM job_allowed_chapters jac
      JOIN profile_chapters pc
        ON pc.chapter_id = jac.chapter_id
       AND pc.profile_id = $${userIdParamIndex}
       AND pc.role = 'head'
      WHERE jac.job_id = ${jobIdColumn}
    )
  )`;
}

/** True when the user has a direct profile grant on the job. */
export async function hasJobProfileGrant(
  db: QueryExecutor,
  userId: string,
  jobId: string,
): Promise<boolean> {
  const { rows } = await db.query<{ ok: number }>(
    `SELECT 1 AS ok FROM job_allowed_profiles
     WHERE job_id = $1 AND profile_id = $2
     LIMIT 1`,
    [jobId, userId],
  );
  return rows.length > 0;
}

/**
 * True when the user is a `head` of a chapter granted on the job
 * (`job_allowed_chapters` ∩ `profile_chapters` where role = head).
 */
export async function isChapterHeadGrantedOnJob(
  db: QueryExecutor,
  userId: string,
  jobId: string,
): Promise<boolean> {
  const { rows } = await db.query<{ ok: number }>(
    `SELECT 1 AS ok
     FROM job_allowed_chapters jac
     JOIN profile_chapters pc
       ON pc.chapter_id = jac.chapter_id
      AND pc.profile_id = $2
      AND pc.role = 'head'
     WHERE jac.job_id = $1
     LIMIT 1`,
    [jobId, userId],
  );
  return rows.length > 0;
}

/** True when the user may view the job via ACL (profile grant or chapter head). */
export async function canViewJobViaAcl(
  db: QueryExecutor,
  userId: string,
  jobId: string,
): Promise<boolean> {
  const { rows } = await db.query<{ ok: number }>(
    `SELECT 1 AS ok WHERE ${jobAclVisibleSql(2, "$1")}`,
    [jobId, userId],
  );
  return rows.length > 0;
}
