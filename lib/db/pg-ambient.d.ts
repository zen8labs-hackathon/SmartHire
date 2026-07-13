// `pg` ships no bundled types and `@types/pg` is not installed (package.json is
// out of scope to modify for this task). This is a hand-written shim covering
// only the subset of the `pg` API actually used under `lib/db/` (Pool /
// PoolClient construction, parameterized `query`, transactions). If `@types/pg`
// is ever added as a real dependency, delete this file — the real types take
// precedence for anything more than this subset.
declare module "pg" {
  export interface QueryResultRow {
    [column: string]: unknown;
  }

  export interface QueryResult<R extends QueryResultRow = QueryResultRow> {
    rows: R[];
    rowCount: number | null;
    command: string;
  }

  export interface PoolConfig {
    connectionString?: string;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  }

  export class PoolClient {
    query<R extends QueryResultRow = QueryResultRow>(
      queryText: string,
      values?: unknown[],
    ): Promise<QueryResult<R>>;
    release(err?: Error): void;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    query<R extends QueryResultRow = QueryResultRow>(
      queryText: string,
      values?: unknown[],
    ): Promise<QueryResult<R>>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
  }
}
