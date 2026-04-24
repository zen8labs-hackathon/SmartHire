# Vercel to Cloudflare Pages Migration

This runbook assumes:

- App: Next.js App Router in this repository
- Data/Auth: Supabase (managed separately)
- Goal: move hosting from Vercel to Cloudflare Pages with low downtime

## 1) Prerequisites

- Cloudflare account (Pages enabled)
- Existing Supabase project(s): production (+ optional staging)
- GitHub repository connected to Cloudflare
- Wrangler CLI for secret management (optional, but recommended)

```bash
npm i -g wrangler
wrangler login
```

## 2) Environment and secret matrix

Use separate environments (`production`, `preview`) and avoid sharing production secrets with preview.

| Key | Production | Preview |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod Supabase URL | staging Supabase URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | prod publishable key | staging publishable key |
| `SUPABASE_SECRET_KEY` | prod secret key | staging secret key |
| `LLM_PROVIDER` | `vercel_gateway` or `gemini` | same or lower-cost default |
| `LLM_MODEL` | chosen global model | optional cheaper model |
| `AI_GATEWAY_API_KEY` | required if `LLM_PROVIDER=vercel_gateway` | optional |
| `GOOGLE_GENERATIVE_AI_API_KEY` | required if `LLM_PROVIDER=gemini` | optional |
| `JD_MATCH_AI_WEIGHT` | optional | optional |
| `SUPABASE_DATABASE_URL` | **only if you run migrations in CI job** | staging DB only (or unset) |
| `SKIP_DB_MIGRATIONS` | usually unset | can be `1` when not running migration step |

## 3) Phase 0 baseline (implemented in repo)

This repository now separates migration from build:

- `npm run build` => app build only
- `npm run db:migrate` => migrations only
- `npm run deploy:prepare` => explicit "migrate then build" command for CI/CD pipelines

Use this pattern on Cloudflare too: migration must be an explicit step, never hidden inside build.

## 4) Create a Cloudflare Pages project

1. Cloudflare Dashboard -> Workers & Pages -> Create application -> Pages.
2. Connect Git repository and select branch:
   - Production branch: `main`
   - Preview branches: all others
3. Build settings:
   - Build command: `npm run build`
   - Build output directory: `.next` (or framework preset for Next.js as recommended by Cloudflare UI)
4. Add environment variables for both `production` and `preview` scopes.

## 5) Migrations strategy on Cloudflare

Cloudflare Pages should not run migrations during build by default.

Recommended:

- Run `npm run db:migrate` in a separate CI pipeline/job before production deploy.
- Gate production deployment on successful migration job.

If you do not have CI yet, run manually from your machine before a production release:

```bash
SUPABASE_DATABASE_URL=... npm run db:migrate
```

## 6) Canary rollout

Keep Vercel live while validating Cloudflare:

1. Deploy `main` to Cloudflare with production env vars.
2. Validate core flows:
   - Login / session refresh / logout
   - Admin user creation
   - Candidate upload and CV parsing trigger path
   - JD extraction, JD match scoring, evaluation PDF generation
3. Run smoke checks on both Vercel and Cloudflare and compare:
   - Error rate (5xx)
   - Latency p95 for key APIs
   - Any runtime incompatibilities

## 7) DNS cutover

1. In Cloudflare Pages, attach production domain.
2. Set low DNS TTL before cutover window.
3. Switch DNS records to Cloudflare target.
4. Keep Vercel deployment available as rollback for at least 7 days.

## 8) Rollback plan

If critical issue appears:

1. Restore DNS to Vercel target.
2. Re-run sanity checks on Vercel.
3. Keep Cloudflare preview deploys active for debugging.

Rollback should be DNS-only and not require DB rollback.

## 9) Post-migration hardening

- Set usage/budget alerts in Cloudflare and Supabase.
- Keep preview environment connected to staging Supabase.
- Add CI workflow:
  - lint + typecheck
  - `db:migrate` on production-approved pipeline
  - deploy
