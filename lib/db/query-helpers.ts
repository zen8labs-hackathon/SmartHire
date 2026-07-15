export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 200;

export type PaginationParams = {
  limit?: number;
  offset?: number;
};

export type PaginatedResult<T> = {
  rows: T[];
  total: number;
  limit: number;
  offset: number;
};

export function clampLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.max(1, Math.trunc(limit)), MAX_LIST_LIMIT);
}

export function clampOffset(offset?: number): number {
  if (offset == null || !Number.isFinite(offset) || offset < 0) return 0;
  return Math.trunc(offset);
}

/**
 * Builds a `col1 = $1, col2 = $2` fragment plus the matching positional
 * values for a partial-update payload, skipping any field whose value is
 * `undefined` (an omitted patch field, not an intentional null-out).
 * `startIndex` lets callers reserve earlier `$n` placeholders (e.g. `$1` for
 * the WHERE id) before the SET values.
 */
export function buildSetClause(
  fields: Record<string, unknown>,
  startIndex = 1,
): { clause: string; values: unknown[] } {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  const clause = entries
    .map(([column], i) => `${column} = $${i + startIndex}`)
    .join(", ");
  const values = entries.map(([, v]) => v);
  return { clause, values };
}

/**
 * Rows selected with `count(*) OVER() AS total_count` (see list queries
 * below) carry the full match count on every row so pagination totals don't
 * need a second round-trip query. Empty result sets have no row to read the
 * count from, hence the `rows.length === 0 ? 0` fallback.
 */
export function extractWindowTotal(
  rows: { total_count: string | number }[],
): number {
  if (rows.length === 0) return 0;
  return Number(rows[0].total_count);
}

/** True for a Postgres unique-constraint violation (SQLSTATE 23505). */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23505"
  );
}

/**
 * Formats a `Date` read from a Postgres `date` column (no timezone) back to
 * `YYYY-MM-DD`. `pg`'s default parser (`postgres-date`) turns a `date`
 * column's text value into a `Date` anchored at *local* midnight (e.g.
 * `new Date(year, month, day)`), not UTC. Using `.toISOString()` on that
 * value re-reads it in UTC, which rolls the date back a day in any positive
 * UTC-offset timezone (e.g. Vietnam, UTC+7) -- a DB value of `2026-07-10`
 * comes back as `"2026-07-09"`. Reading the same local getters `pg` used to
 * construct the `Date` reverses it correctly regardless of server TZ.
 */
export function dbDateToIso(d: Date | null | undefined): string | null {
  if (d == null) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
