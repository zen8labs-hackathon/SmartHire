/**
 * Runs pending SQL files from supabase/migrations/ against Postgres during Vercel build.
 *
 * Env:
 *   SUPABASE_DATABASE_URL — Postgres connection URI (Settings → Database → URI).
 *     Prefer the direct/session connection (port 5432) for DDL; pooler can fail on some statements.
 *   SKIP_DB_MIGRATIONS — set to "1" or "true" to skip (local or emergency).
 *
 * On Vercel, if SUPABASE_DATABASE_URL is unset, skips with a warning (deploy still succeeds).
 *
 * Vercel build environments often cannot reach IPv6-only routes. Node otherwise may pick an
 * AAAA record first and fail with ENETUNREACH — we prefer IPv4 (A records) when both exist.
 */

import dns from "node:dns";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

const ADVISORY_LOCK_KEY1 = 582_019_004;
const ADVISORY_LOCK_KEY2 = 771_009_441;

function skip(msg) {
  console.warn(`[db-migrate] ${msg}`);
}

function fail(msg) {
  console.error(`[db-migrate] ${msg}`);
  process.exit(1);
}

function migrationVersion(filename) {
  const m = /^(\d{14})_[^/]+\.sql$/i.exec(filename);
  return m ? m[1] : null;
}

/**
 * Vercel build workers often have no IPv6 route; Supabase hostnames may resolve to IPv6 first.
 * On VERCEL, resolve the DB host to an IPv4 address and connect there, preserving TLS SNI.
 */
async function pgClientConfigFromUrl(urlString) {
  const isLocal =
    urlString.includes("localhost") || urlString.includes("127.0.0.1");

  const connectionTimeoutMillis = 25_000;
  const sslBase =
    isLocal ? undefined : { rejectUnauthorized: false };

  if (isLocal || process.env.VERCEL !== "1") {
    return {
      connectionString: urlString,
      connectionTimeoutMillis,
      ssl: sslBase,
    };
  }

  let canonical;
  try {
    canonical = new URL(urlString.replace(/^postgres(ql)?:/i, "http:"));
  } catch {
    return {
      connectionString: urlString,
      connectionTimeoutMillis,
      ssl: sslBase,
    };
  }

  const logicalHost = canonical.hostname;
  if (!logicalHost) {
    return {
      connectionString: urlString,
      connectionTimeoutMillis,
      ssl: sslBase,
    };
  }

  try {
    const { address } = await dns.promises.lookup(logicalHost, {
      family: 4,
    });
    canonical.hostname = address;
    const connectionString = canonical
      .toString()
      .replace(/^http:/, "postgresql:");
    return {
      connectionString,
      connectionTimeoutMillis,
      ssl: {
        ...sslBase,
        servername: logicalHost,
      },
    };
  } catch (e) {
    console.warn(
      `[db-migrate] IPv4 lookup for ${logicalHost} failed (${e instanceof Error ? e.message : e}); connecting with original hostname.`,
    );
    return {
      connectionString: urlString,
      connectionTimeoutMillis,
      ssl: sslBase,
    };
  }
}

async function main() {
  if (process.env.SKIP_DB_MIGRATIONS === "1" || process.env.SKIP_DB_MIGRATIONS === "true") {
    skip("SKIP_DB_MIGRATIONS set — not running migrations.");
    return;
  }

  const url =
    process.env.SUPABASE_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    "";

  if (!url) {
    if (process.env.VERCEL === "1") {
      skip(
        "SUPABASE_DATABASE_URL not set on Vercel — skipping migrations. Add it in Project → Environment Variables to auto-apply schema on deploy.",
      );
    } else {
      skip(
        "SUPABASE_DATABASE_URL / DATABASE_URL not set — skipping migrations (normal for local next dev).",
      );
    }
    return;
  }

  let files;
  try {
    files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch (e) {
    fail(`Cannot read migrations dir: ${e instanceof Error ? e.message : e}`);
  }

  if (files.length === 0) {
    skip("No .sql files in supabase/migrations.");
    return;
  }

  const client = new pg.Client(await pgClientConfigFromUrl(url));

  try {
    await client.connect();
  } catch (e) {
    fail(`Database connection failed: ${e instanceof Error ? e.message : e}`);
  }

  try {
    await client.query(
      "SELECT pg_advisory_lock($1::integer, $2::integer)",
      [ADVISORY_LOCK_KEY1, ADVISORY_LOCK_KEY2],
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS public._smart_hire_schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    try {
      await client.query(
        `REVOKE ALL ON TABLE public._smart_hire_schema_migrations FROM anon, authenticated`,
      );
    } catch {
      /* local Postgres may not define Supabase roles */
    }

    try {
      const { rows: remote } = await client.query(
        "SELECT version FROM supabase_migrations.schema_migrations",
      );
      for (const { version } of remote) {
        if (version && /^\d{14}$/.test(String(version))) {
          await client.query(
            `INSERT INTO public._smart_hire_schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING`,
            [String(version)],
          );
        }
      }
    } catch {
      /* schema not used (e.g. plain Postgres) */
    }

    const { rows: appliedRows } = await client.query(
      "SELECT version FROM public._smart_hire_schema_migrations",
    );
    const applied = new Set(appliedRows.map((r) => r.version));

    for (const file of files) {
      const version = migrationVersion(file);
      if (!version) {
        skip(`Skipping ${file} (filename must start with 14-digit timestamp).`);
        continue;
      }
      if (applied.has(version)) {
        continue;
      }

      const fullPath = join(MIGRATIONS_DIR, file);
      const sql = readFileSync(fullPath, "utf8").trim();
      if (!sql) {
        skip(`${file} is empty — recording as applied.`);
        await client.query(
          "INSERT INTO public._smart_hire_schema_migrations (version) VALUES ($1)",
          [version],
        );
        applied.add(version);
        continue;
      }

      console.log(`[db-migrate] Applying ${file} …`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO public._smart_hire_schema_migrations (version) VALUES ($1)",
          [version],
        );
        await client.query("COMMIT");
        applied.add(version);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }

    console.log("[db-migrate] Migrations up to date.");
  } catch (e) {
    fail(`Migration failed: ${e instanceof Error ? e.message : e}`);
  } finally {
    try {
      await client.query(
        "SELECT pg_advisory_unlock($1::integer, $2::integer)",
        [ADVISORY_LOCK_KEY1, ADVISORY_LOCK_KEY2],
      );
    } catch {
      /* ignore */
    }
    await client.end();
  }
}

await main();
