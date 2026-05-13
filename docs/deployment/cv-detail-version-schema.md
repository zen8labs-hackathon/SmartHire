# CV detail versioning schema (`cv_detail_version`)

## Symptoms

- API or Supabase logs: **`column candidates.cv_detail_version does not exist`** (Postgres `42703`).
- Or: **`relation "public.candidate_cv_detail_version_events" does not exist`** (Postgres `42P01`).
- Admin candidate list / CV views may fail to load until the migration is applied.

## What to apply

Run migration file:

- [`supabase/migrations/20260511120000_candidate_cv_detail_version_events.sql`](../../supabase/migrations/20260511120000_candidate_cv_detail_version_events.sql)

It adds:

- `public.candidates.cv_detail_version` (integer, default `1`, `>= 1`)
- `public.candidate_cv_detail_version_events` (+ RLS policies)

## How to apply (pick one)

### A) Repo script (direct Postgres URI)

Uses [`scripts/apply-vercel-migrations.mjs`](../../scripts/apply-vercel-migrations.mjs). Set a **direct** DB URI (port **5432**), not the pooler, for DDL:

```bash
cd smart-hire-web
SUPABASE_DATABASE_URL='postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres' npm run db:migrate
```

See also [`.env.example`](../../.env.example) for `SUPABASE_DATABASE_URL`.

### B) Supabase CLI (linked project)

From `smart-hire-web` (directory containing `supabase/config.toml`):

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
```

## After migration

- `GET /api/admin/candidates` and SSR candidate pages should load again (list selects no longer require `cv_detail_version` before migration; versioning routes work once the column and events table exist).
- Re-deploy or run `npm run db:migrate` in CI **before** relying on profile restore / version history features in production.

## App behavior before schema exists

Versioning-related routes return **503** with a clear message pointing at this migration, instead of a raw SQL error. Candidate **listing** avoids selecting `cv_detail_version` so the CV grid can load even if versioning DDL is pending.
