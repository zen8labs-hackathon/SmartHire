import { Pool } from "pg";
import type { QueryResultRow } from "pg";

// Row types across lib/db/*.ts follow `pg`'s default (unconfigured) text-format
// type parsers, which differ from this repo's existing Supabase-js row types:
// bigint/numeric columns come back as `string` (precision preservation, not
// JS-safe as `number`), while date/timestamp/timestamptz columns come back as
// real `Date` objects (not ISO strings, unlike Supabase-js). No custom
// `pg-types` parser is registered here, so this is the actual runtime shape.

/**
 * Structural interface every `lib/db/*` repository function depends on
 * instead of the concrete `pg` `Pool`/`PoolClient` classes. Both satisfy this
 * shape, so the same repository function works against the pool (single
 * statement) or a checked-out client (inside a transaction) and can be
 * driven in tests by a plain `{ query: vi.fn() }` object.
 */
export interface QueryExecutor {
  query<R extends QueryResultRow = QueryResultRow>(
    queryText: string,
    values?: unknown[],
  ): Promise<{ rows: R[] }>;
}

let pool: Pool | null = null;

/**
 * Lazily-initialized singleton pool. Reuses `DATABASE_URL` (the same env var
 * `node-pg-migrate` already reads — see `.env.example`) rather than a new one.
 */
export function getPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Missing DATABASE_URL environment variable (required for lib/db queries)",
    );
  }

  pool = new Pool({ connectionString });
  return pool;
}

/** For tests only: forces the next `getPool()` call to construct a fresh Pool. */
export function resetPoolForTests(): void {
  pool = null;
}

export async function query<R extends QueryResultRow = QueryResultRow>(
  queryText: string,
  values: unknown[] = [],
): Promise<R[]> {
  const result = await getPool().query<R>(queryText, values);
  return result.rows;
}

export async function queryOne<R extends QueryResultRow = QueryResultRow>(
  queryText: string,
  values: unknown[] = [],
): Promise<R | null> {
  const rows = await query<R>(queryText, values);
  return rows[0] ?? null;
}

/**
 * Runs `fn` inside a single BEGIN/COMMIT transaction on a dedicated checked-out
 * client, rolling back on any thrown error. Needed for multi-statement writes
 * that must commit atomically, e.g. inserting `campaign_applied` and its
 * initial `cv_detail_versions` row together (see
 * `lib/db/campaign-applied.ts::createApplicationWithInitialCv`).
 */
export async function withTransaction<T>(
  fn: (client: QueryExecutor) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
