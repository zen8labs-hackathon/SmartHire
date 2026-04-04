# Smart Hire Web

Next.js (App Router), Supabase Auth, Tailwind CSS v4, and [HeroUI v3](https://heroui.com/docs/react/getting-started), deployed to Vercel.

Users sign up and sign in with **email** and password. A database trigger creates a matching `profiles` row with a derived internal `username` slug (for example from the part before `@` in the email). Users with **`profiles.is_admin = true`** can open **`/admin`** and create accounts with the Supabase Auth Admin API (requires **`SUPABASE_SECRET_KEY`**).

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project

## 1. Environment variables

Copy the example file and fill in values:

```bash
cp .env.example .env.local
```

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL (Settings → API) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (`sb_publishable_...`; Settings → API Keys). Legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is still read if unset. |
| `SUPABASE_SECRET_KEY` | Secret key (`sb_secret_...`) or legacy `SUPABASE_SERVICE_ROLE_KEY` JWT — **server only**. Needed for the admin “add user” action. |

## 2. Database migration

Apply migrations in order:

1. [`supabase/migrations/20250402120000_init_profiles_username_auth.sql`](supabase/migrations/20250402120000_init_profiles_username_auth.sql)  
2. [`supabase/migrations/20250403140000_email_auth_profile_usernames.sql`](supabase/migrations/20250403140000_email_auth_profile_usernames.sql)  
3. [`supabase/migrations/20250403150000_profiles_is_admin.sql`](supabase/migrations/20250403150000_profiles_is_admin.sql)  
4. [`supabase/migrations/20250403160000_seed_test_admin.sql`](supabase/migrations/20250403160000_seed_test_admin.sql) (optional for production — see below)

- Supabase Dashboard → SQL Editor → run each file, or  
- [Supabase CLI](https://supabase.com/docs/guides/cli): `supabase db push` (if this folder is linked to your project).

The second migration updates the new-user trigger so any real email produces a valid `profiles.username`, and removes the old `username_to_email` RPC. The third adds **`is_admin`** on `profiles` and blocks signed-in users from toggling it (use the SQL Editor or service role to promote admins). The fourth seeds a **test admin** (idempotent).

**Test admin** — Inserted by migration 4 when you run the chain (including `supabase db reset`).

| | |
| --- | --- |
| Email | `admin@smart-hire.test` |
| Password | `SmartHireTestAdmin!1` |

User id (fixed): `a1111111-1111-4111-8111-111111111111`. The row is **`profiles.is_admin = true`** so `/admin` works once **`SUPABASE_SECRET_KEY`** is set.

**Production:** Skip migration `20250403160000_seed_test_admin.sql`, or delete this user after deploy — it is a known password. If `auth.users` on your project has extra required columns and the insert fails, remove that migration from your chain and create admins via the dashboard or `profiles` update instead.

**Promote an admin** (run in SQL Editor after you know the user’s UUID from **Authentication → Users**):

```sql
update public.profiles
set is_admin = true
where id = 'PASTE_USER_UUID_HERE';
```

## 3. Supabase Auth settings

In the Supabase Dashboard:

1. **Authentication → URL configuration**  
   - **Site URL**: your production URL (e.g. `https://your-app.vercel.app`).  
   - **Redirect URLs**: add the same URL (and `http://localhost:3000` for local dev).

2. **Email / password**  
   - Enable the Email provider if it is not already enabled.

3. **Confirm email**  
   - For local development, you may turn off “Confirm email” so new users get a session immediately after sign-up.  
   - For production, enabling confirmation is recommended; users will need to confirm before a session is issued.

## 4. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## 5. Deploy to Vercel

1. Push this repository to GitHub (or GitLab/Bitbucket) and import the repo in [Vercel](https://vercel.com).  
2. Set the environment variables in the Vercel project (**Settings → Environment Variables**), including `SUPABASE_SECRET_KEY` if you use `/admin`.  
3. Redeploy after changing env vars.

### Auto database migrations on build

Each `npm run build` on Vercel (including **preview** deployments for branches) runs [`scripts/apply-vercel-migrations.mjs`](scripts/apply-vercel-migrations.mjs) first. It applies any pending `supabase/migrations/*.sql` files in order, tracked in `public._smart_hire_schema_migrations`.

| Variable | Purpose |
|----------|---------|
| `SUPABASE_DATABASE_URL` | **Postgres connection URI** (Supabase **Settings → Database**). Prefer the **direct** connection (port `5432`, “Session mode”) so DDL runs reliably; the transaction pooler can fail on some migrations. |
| `SKIP_DB_MIGRATIONS` | Set to `1` or `true` to skip migration step (debug only). |

If `SUPABASE_DATABASE_URL` is **not** set on Vercel, the script logs a warning and **skips** migrations so existing projects keep deploying. To enable auto-migrate, add the URI for the environments you want (**Production** vs **Preview**).

**Important:** Point **Preview** at a **staging** Supabase project (or omit the URL for Preview) if you do not want every branch deploy to migrate **production** data.

You can run the same step locally when the URL is set: `npm run db:migrate`.

**Vercel `ENETUNREACH` / IPv6:** Build machines often cannot reach IPv6 addresses. The migration script prefers IPv4: it sets `dns.setDefaultResultOrder("ipv4first")` and, on Vercel, resolves the database host with IPv4 and connects using TLS `servername` so certificates still validate. If connection still fails, check Supabase **Database** settings for an IPv4-compatible connection string or [IPv4 add-on](https://supabase.com/docs/guides/platform/ipv4-address).

**Smoke test:** [`supabase/migrations/20260404150000_migration_smoke_test.sql`](supabase/migrations/20260404150000_migration_smoke_test.sql) adds standalone table `public.migration_smoke_test` (no FKs, RLS on with no policies so the app does not expose it). After a successful Vercel build, confirm in the Supabase SQL Editor: `select * from public.migration_smoke_test;` (empty row set is fine). Drop the table when you no longer need the check.

### Vercel MCP

If you use the Vercel MCP in Cursor, the `deploy_to_vercel` tool deploys the **current project directory**. Run it from this folder after the project is linked to Vercel, or rely on Git-based deployments from the dashboard.

## Project structure (high level)

- [`middleware.ts`](middleware.ts) — Refreshes the Supabase session; protects `/dashboard` and `/admin`; redirects signed-in users away from `/login` and `/signup`.
- [`lib/supabase/server.ts`](lib/supabase/server.ts) / [`client.ts`](lib/supabase/client.ts) — Supabase clients for Server Components / browser.
- [`lib/supabase/admin.ts`](lib/supabase/admin.ts) — Service-role client for Auth Admin API (server only).
- [`app/auth/actions.ts`](app/auth/actions.ts) — Server Actions: `signIn`, `signUp`, `signOut`.
- [`app/admin/`](app/admin/) — Admin UI to add users by email.
- [`components/auth/`](components/auth/) — HeroUI forms and sign-out control.

## HeroUI and Tailwind

HeroUI v3 expects **Tailwind CSS v4** and this import order in [`app/globals.css`](app/globals.css):

1. `@import "tailwindcss";`  
2. `@import "@heroui/styles";`

Use the HeroUI MCP or [component docs](https://heroui.com/docs/react/getting-started) when extending the UI.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server |
| `npm run build` | Apply pending DB migrations (if configured), then production build |
| `npm run db:migrate` | Apply pending migrations only (needs `SUPABASE_DATABASE_URL` or `DATABASE_URL`) |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
