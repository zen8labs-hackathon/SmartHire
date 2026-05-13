type PgLikeError = {
  code?: string | null;
  message?: string | null;
};

function msg(err: PgLikeError | null | undefined): string {
  return String(err?.message ?? "").toLowerCase();
}

function pgCode(err: PgLikeError | null | undefined): string | null {
  const c = err?.code;
  return c == null || c === "" ? null : String(c);
}

/** Postgres undefined_column — PostgREST often surfaces this as HTTP 400. */
const PG_UNDEFINED_COLUMN = "42703";
/** Postgres undefined_table */
const PG_UNDEFINED_TABLE = "42P01";

export function isMissingCvDetailVersionColumn(
  err: PgLikeError | null | undefined,
): boolean {
  const code = pgCode(err);
  const m = msg(err);
  if (code === PG_UNDEFINED_COLUMN && m.includes("cv_detail_version")) {
    return true;
  }
  return (
    m.includes("column") &&
    m.includes("cv_detail_version") &&
    m.includes("does not exist")
  );
}

export function isMissingCvVersionEventsTable(
  err: PgLikeError | null | undefined,
): boolean {
  const code = pgCode(err);
  const m = msg(err);
  if (
    code === PG_UNDEFINED_TABLE &&
    m.includes("candidate_cv_detail_version_events")
  ) {
    return true;
  }
  return (
    (m.includes("relation") || m.includes("table")) &&
    m.includes("candidate_cv_detail_version_events") &&
    m.includes("does not exist")
  );
}

export function versioningMigrationRequiredResponse() {
  return Response.json(
    {
      error:
        "CV versioning schema is not ready. Please run DB migration 20260511120000_candidate_cv_detail_version_events.sql.",
    },
    { status: 503 },
  );
}
