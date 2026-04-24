# Code Analysis Deliverable — SmartHire

**Application:** SmartHire — AI-Powered Hiring & Recruitment Management System
**Date:** 2026-04-08
**Analyst Role:** Pre-Recon Code Intelligence Gatherer
**Assessment Type:** Security-focused architectural analysis for penetration testing

---

# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the SmartHire application. All findings adhere to the scope definitions below.

### In-Scope: Network-Reachable Components
A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- All Next.js API routes under `/api/admin/*` and `/api/public/*` (31+ endpoints)
- Next.js Server Actions (sign-in, sign-out, admin user creation)
- Supabase Edge Functions invoked by network-accessible API routes (`process-cv`)
- The Next.js middleware authenticating and routing all HTTP requests
- Supabase Realtime subscriptions triggered by authenticated WebSocket connections
- All React pages served by the Next.js server (admin dashboard, login, evaluation preview)

### Out-of-Scope: Locally Executable Only
The following components **cannot** be invoked through the running application's network interface:
- `scripts/apply-vercel-migrations.mjs` — CLI migration script executed during Vercel build, not network-accessible
- Supabase CLI local development tools (`supabase start`, `supabase db push`)
- ESLint configuration (`eslint.config.mjs`) — build tooling only
- PostCSS configuration (`postcss.config.mjs`) — build tooling only
- `.specstory/` and `.vscode/` directories — developer environment configuration

---

## 1. Executive Summary

SmartHire is a full-stack recruitment management application built on Next.js 16 (React 19) with a Supabase (PostgreSQL) backend-as-a-service. The application manages sensitive candidate data including CVs, personal information (email, phone, education), interview notes, and AI-generated evaluation reports. The architecture follows a modern JAMstack pattern deployed on Vercel with Supabase providing authentication, database, storage, and edge functions. An AI integration via Vercel AI Gateway sends candidate and job description data to external LLM services (OpenAI GPT-4o-mini, Grok-4) for automated extraction, matching, and evaluation generation.

From a security posture perspective, SmartHire implements several strong defensive measures: Row-Level Security (RLS) policies on all primary database tables, JWT-based authentication via Supabase Auth with refresh token rotation, role-based access control (RBAC) with admin/HR/chapter-based authorization tiers, and signed URL generation for all file storage access. The application uses Zod schema validation on API inputs and avoids dangerous patterns like `dangerouslySetInnerHTML`, raw SQL queries, or command execution. However, significant security gaps exist that warrant immediate attention.

**Critical findings** include: (1) production secrets (Supabase service role key, AI Gateway API key) committed to the repository in `.env.local` — though this file is untracked by Git; (2) evaluation preview tokens that grant public, unauthenticated access to candidate PDFs with no expiration or rate limiting; (3) sensitive PII (candidate email, phone, full CV text) transmitted to external AI services without data masking or explicit consent tracking; (4) missing security headers (CSP, HSTS, X-Frame-Options); (5) database SSL enforcement disabled in configuration; and (6) no audit logging for sensitive administrative operations. The single publicly accessible endpoint (`/api/public/evaluation-preview/{token}`) represents the highest-priority attack surface for an external attacker.

---

## 2. Architecture & Technology Stack

### Framework & Language
SmartHire is built with **Next.js 16.2.2** running on **React 19.2.4** with **TypeScript 5**. The Next.js App Router pattern is used, which means all pages and API routes are file-system based under the `app/` directory. Server Components and Server Actions are used for server-side rendering and form handling respectively. The security implication of this architecture is that the boundary between client and server code is defined by file conventions (`'use server'` directives, `route.ts` files), and misconfiguration could expose server-only logic to the client. The framework provides built-in protections against common web vulnerabilities (automatic output escaping in React, CSRF protection via Server Actions), but the application does not configure additional security headers like Content Security Policy (CSP) or HTTP Strict Transport Security (HSTS).

**Key dependencies** include: `@supabase/supabase-js` and `@supabase/ssr` for database/auth/storage operations, `ai` (Vercel AI SDK) for LLM integration, `pdf-lib` and `pdf-parse` for PDF manipulation, `mammoth` for DOCX-to-text conversion, `zod` for runtime schema validation, and `@heroui/react` with Tailwind CSS v4 for the UI layer. The `package.json` at the repository root shows 24 direct dependencies. No dedicated security libraries (helmet, csurf, express-rate-limit) are present since Next.js and Supabase handle most security concerns natively.

### Architectural Pattern
The application follows a **monolithic frontend + BaaS (Backend-as-a-Service)** pattern. The Next.js server handles both UI rendering and API logic, while Supabase provides managed PostgreSQL, authentication, file storage, and edge functions. There is no separate backend API server — all server-side logic runs within Next.js API routes or Supabase Edge Functions (Deno runtime). Trust boundaries exist at three levels: (1) Browser client → Next.js server (authenticated via JWT cookies or Bearer tokens), (2) Next.js server → Supabase (authenticated via anon key for RLS-enforced queries or service role key for admin operations), and (3) Next.js server → Vercel AI Gateway (authenticated via API key). The critical trust assumption is that Supabase RLS policies correctly enforce data isolation — if the service role key is compromised, all RLS is bypassed.

### Critical Security Components
- **Authentication:** Supabase Auth with email/password, JWT sessions (1-hour expiry), refresh token rotation (10-second reuse interval)
- **Authorization:** Three-tier RBAC: Admin (`is_admin=true`), HR (`work_chapter='HR'`), Chapter Recruiters (via `profile_chapters` table). Database trigger `profiles_is_admin_guard` prevents user-level modification of the `is_admin` flag.
- **Data Protection:** Supabase Storage with signed URLs (120-second TTL for downloads), private storage buckets for CVs, JDs, and evaluation PDFs. File upload validation by extension (not MIME/magic bytes).
- **Input Validation:** Zod schemas on all POST/PUT API bodies, regex validation for UUIDs and tokens, numeric bounds checking for IDs.

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms

SmartHire uses **Supabase Auth** as its sole authentication provider, supporting email/password sign-in. No OAuth, OIDC, SSO, or MFA is implemented (all disabled in `supabase/config.toml`). The authentication flow operates as follows: users submit credentials via a Server Action (`app/auth/actions.ts`), which calls `supabase.auth.signInWithPassword()`. On success, Supabase sets HTTP-only session cookies managed by the `@supabase/ssr` library. The middleware (`middleware.ts`) intercepts all requests, refreshes the session token via cookie rotation, and enforces route-level access control.

**Authentication API Endpoints:**
- **Sign In:** Server Action at `app/auth/actions.ts` → `signIn()` (lines 18-45). Accepts `email` and `password` from form data. Email normalized to lowercase with regex validation (5-254 chars). Redirects to `safeNextPath()` on success, which validates the redirect URL to prevent open redirects (blocks `//` and `://` patterns).
- **Sign Out:** Server Action at `app/auth/actions.ts` → `signOut()` (lines 48-53). Calls `supabase.auth.signOut()` and redirects to `/login`.
- **User Creation:** Server Action at `app/admin/actions.ts` → `adminAddUser()` (lines 71-97). Creates new users via `admin.auth.admin.createUser()` with `email_confirm: true`. Requires HR authorization. Minimum 8-character password enforced.
- **Session Refresh:** Implicit in middleware (`middleware.ts` lines 18-31). On every request, `supabase.auth.getUser()` is called which automatically refreshes expired access tokens using the refresh token from cookies.

**Security Concern — Signup Disabled but Accessible:** Signup is functionally disabled (`enable_signup = false` in Supabase config), and the middleware redirects `/signup` to `/login?reason=no-signup`. However, if Supabase config drifts, the underlying auth endpoint could accept signups. The application relies on configuration rather than code enforcement.

### Session Management and Token Security

Session cookies are managed by Supabase SSR (`lib/supabase/server.ts` lines 14-31) using Next.js `cookies()` API. The Supabase SSR library handles `HttpOnly`, `Secure`, and `SameSite` cookie flags through its internal implementation — **no explicit cookie flag configuration exists in the application code**. This means cookie security relies entirely on Supabase's defaults, which set `HttpOnly=true`, `Secure=true` (in production), and `SameSite=Lax`. The exact configuration point is within the `@supabase/ssr` package internals, not in application source files.

JWT tokens are configured in `supabase/config.toml`:
- Token expiry: 3600 seconds (1 hour) — line 158
- Refresh token rotation: enabled — line 164
- Refresh token reuse interval: 10 seconds — line 167

Bearer token authentication is also supported. API routes accept `Authorization: Bearer <token>` headers, parsed in `lib/admin/require-staff-request.ts` (lines 26-27) via `raw?.startsWith("Bearer ") ? raw.slice(7).trim() : ""`. The token is validated by creating a temporary Supabase client with `persistSession: false` and calling `supabase.auth.getUser(bearer)`.

**Security Concern:** Bearer token validation relies entirely on Supabase's JWT verification. No local claim validation (issuer, audience, expiry) is performed in application code. If Supabase's verification were to fail silently, access could be granted with invalid tokens.

### Authorization Model

The authorization model implements a **three-tier RBAC hierarchy**:

1. **Admin** (`profiles.is_admin = true`): Full system access. Protected by database trigger `profiles_is_admin_guard` (migration `20250402120000`) that prevents any authenticated user from modifying the `is_admin` column — only the `service_role` can change it.
2. **HR** (`profiles.work_chapter = 'HR'` OR `is_admin = true`): Full recruiting access including user creation, JD management, and all candidate operations.
3. **Chapter Recruiters** (via `profile_chapters` table): Scoped access to job descriptions explicitly granted to them or their chapter, and candidates associated with those JDs.

Authorization is enforced at two layers:
- **Middleware layer** (`middleware.ts` lines 52-63): Checks `isProfileStaff()` for `/admin` page routes. Redirects non-staff to `/dashboard`.
- **API layer**: Each API route calls `requireAdminForRequest()`, `requireStaffForRequest()`, or `requireHrForRequest()` (defined in `lib/admin/require-admin-request.ts` and `lib/admin/require-staff-request.ts`). These functions check the user's profile via `getStaffProfileAccess()` (`lib/admin/profile-access.ts` lines 18-49).

**Potential Bypass Scenario:** The middleware only protects page routes (matching `/((?!_next/static|_next/image|favicon.ico|.*\\.(svg|png|jpg|jpeg|gif|webp)$).*)`). API routes under `/api/admin/*` rely on inline auth checks within each route handler. If a developer adds a new API route without calling `requireAdminForRequest()` or `requireStaffForRequest()`, it would be accessible without authentication. There is no global API auth middleware.

### Multi-tenancy Security

Chapter-based data isolation is enforced via complex RLS policies (migration `20260409120000`). Non-HR recruiters can only see JDs they're explicitly granted access to (via `job_description_viewers` or `job_description_viewer_chapters` tables) and candidates associated with those JDs. The RLS policies use nested EXISTS subqueries with multiple joins, which are functionally correct but complex enough to be error-prone during future modifications.

---

## 4. Data Security & Storage

### Database Security

SmartHire uses **PostgreSQL 17** via Supabase with **Row-Level Security (RLS)** as the primary data isolation mechanism. RLS is enabled on all primary tables: `profiles`, `candidates`, `job_descriptions`, `job_openings`, `candidate_evaluation_reviews`, `chapters`, `profile_chapters`, `job_description_viewers`, `job_description_viewer_chapters`, and `candidate_evaluation_template`.

**Critical Gap — Tables with RLS Effectively Disabled:**
- `pipeline_candidate_pre_interview_notes`: RLS is set to allow all authenticated users full access (migration `20260409100000` lines 20-25). The migration comment states "Access only via API (service role)" — meaning security is deferred entirely to the API layer. If the Supabase anon key is used to query this table directly (bypassing the API), any authenticated user could read/write all pre-interview notes.
- `candidate_interview_notes`: SELECT policy blocks authenticated users at the RLS level (migration `20260408120000` lines 64-66), but INSERT is allowed for any authenticated user. Access control for reading notes is enforced only through the API.

**SQL Injection:** No raw SQL queries were detected in the application code. All database interactions use the Supabase JavaScript SDK's query builder (`.from().select().eq()` pattern), which parameterizes all inputs. No `.rpc()` calls with user-controlled arguments were found.

**Database SSL:** SSL enforcement is **disabled** in `supabase/config.toml` (lines 77-79, commented out). In production on Supabase Cloud, SSL is enforced at the infrastructure level, but this configuration gap is noteworthy for self-hosted deployments.

### Data Flow Security — PII Exposure Path

Candidate personal information flows through the following path with security implications at each stage:

1. **CV Upload:** Admin uploads PDF/DOCX → stored in private `candidate-cvs` bucket (admin-only RLS)
2. **CV Processing:** Edge function `process-cv` extracts text → AI parses to structured data → `parsed_payload` JSONB stored in `candidates` table (contains email, phone, education, GPA)
3. **JD Matching:** `lib/candidates/jd-match.ts` (lines 13-39) builds a CV summary including email and phone, which is sent to Vercel AI Gateway for scoring
4. **Evaluation Generation:** `lib/ai/fill-candidate-evaluation.ts` sends candidate name, reviewer notes, and interview notes to AI for PDF form filling
5. **Preview Token:** A 48-char hex token grants unauthenticated public access to the filled evaluation PDF forever

**Critical Data Leakage:** PII (email, phone numbers) extracted from CVs is transmitted to external AI services (Vercel AI Gateway → OpenAI/xAI) without masking. No data processing agreement is documented in the codebase, and no consent tracking exists for AI processing of candidate data.

### Multi-tenant Data Isolation

Chapter-based isolation relies on complex RLS policies with nested joins across `job_description_viewers`, `job_description_viewer_chapters`, and `profile_chapters` tables. The policy logic (migration `20260409120000` lines 225-255) correctly implements the access model but is complex enough that a single modification error could expose cross-chapter candidate data. No integration tests for RLS isolation were found in the codebase.

All PII is stored in **plaintext** — no application-level encryption or Supabase Vault integration is used for sensitive fields like `parsed_payload` (email, phone), `reviewer_notes`, or `candidate_name`.

---

## 5. Attack Surface Analysis

### External Entry Points

The application exposes **32 network-accessible endpoints** organized into the following categories:

#### Public Endpoints (No Authentication Required)
| Endpoint | Method | File | Security Notes |
|----------|--------|------|---------------|
| `/api/public/evaluation-preview/{token}` | GET | `app/api/public/evaluation-preview/[token]/route.ts` | Token-based PDF access. 48-char hex token validated via regex (`/^[0-9a-f]{48}$/i`). No rate limiting. No token expiry. Returns PDF with `Cache-Control: private, max-age=300`. **Highest priority target.** |

#### Admin-Only Endpoints (Require `is_admin=true` or `work_chapter='HR'`)
| Endpoint | Method | File | Input |
|----------|--------|------|-------|
| `/api/admin/job-descriptions` | POST | `app/api/admin/job-descriptions/route.ts` | JSON body with position, department, viewer configs |
| `/api/admin/job-descriptions/{id}` | PUT | `app/api/admin/job-descriptions/[id]/route.ts` | Partial JD fields + viewer emails/chapters |
| `/api/admin/job-descriptions/{id}` | DELETE | `app/api/admin/job-descriptions/[id]/route.ts` | Path param: numeric ID |
| `/api/admin/job-descriptions/extract` | POST | `app/api/admin/job-descriptions/extract/route.ts` | `{ jobOpeningId: UUID }` — triggers AI extraction |
| `/api/admin/job-openings` | GET | `app/api/admin/job-openings/route.ts` | Lists job openings |
| `/api/admin/job-openings/sign-upload` | POST | `app/api/admin/job-openings/sign-upload/route.ts` | `{ filename, mimeType?, replaceJobOpeningId? }` |
| `/api/admin/job-openings/sign-upload` | DELETE | `app/api/admin/job-openings/sign-upload/route.ts` | Query param: `jobOpeningId` (UUID) |
| `/api/admin/candidates/sign-upload` | POST | `app/api/admin/candidates/sign-upload/route.ts` | `{ filename, source, sourceOther?, jobOpeningId?, mimeType? }` |
| `/api/admin/candidates/{id}` | PATCH | `app/api/admin/candidates/[id]/route.ts` | Pipeline status update |
| `/api/admin/candidates/{id}` | DELETE | `app/api/admin/candidates/[id]/route.ts` | Deletes candidate + CV file |
| `/api/admin/candidates/pipeline` | POST | `app/api/admin/candidates/pipeline/route.ts` | Bulk status update (max 100) |
| `/api/admin/candidates/{id}/timeline` | PATCH | `app/api/admin/candidates/[id]/timeline/route.ts` | Interview/onboarding dates |
| `/api/admin/chapters` | POST | `app/api/admin/chapters/route.ts` | `{ name: string (max 120) }` |
| `/api/admin/chapters/{id}` | DELETE | `app/api/admin/chapters/[id]/route.ts` | Path param: UUID |
| `/api/admin/accounts/search` | GET | `app/api/admin/accounts/search/route.ts` | Query param: `q` (email substring, min 2 chars) — **user enumeration** |
| `/api/admin/candidate-evaluation-template` | GET/DELETE | `app/api/admin/candidate-evaluation-template/route.ts` | Template management |
| `/api/admin/candidate-evaluation-template/sign-upload` | POST | `app/api/admin/candidate-evaluation-template/sign-upload/route.ts` | PDF upload signing |
| `/api/admin/candidate-evaluation-template/commit` | POST | `app/api/admin/candidate-evaluation-template/commit/route.ts` | Finalizes template upload |

#### Staff-Level Endpoints (Require authenticated staff/recruiter)
| Endpoint | Method | File | Input |
|----------|--------|------|-------|
| `/api/admin/job-descriptions` | GET | `app/api/admin/job-descriptions/route.ts` | Query param: `status` |
| `/api/admin/job-descriptions/{id}` | GET | `app/api/admin/job-descriptions/[id]/route.ts` | Path param: numeric ID |
| `/api/admin/job-descriptions/{id}/jd-download` | GET | `app/api/admin/job-descriptions/[id]/jd-download/route.ts` | 302 redirect to signed URL |
| `/api/admin/job-descriptions/{id}/candidate-status-counts` | GET | `app/api/admin/job-descriptions/[id]/candidate-status-counts/route.ts` | Status counts |
| `/api/admin/job-descriptions/{id}/pre-interview-note` | GET/PUT | `app/api/admin/job-descriptions/[id]/pre-interview-note/route.ts` | UUID query param + note body (max 32K) |
| `/api/admin/job-descriptions/{id}/interview-notes` | GET/POST | `app/api/admin/job-descriptions/[id]/interview-notes/route.ts` | Notes body (max 32K) |
| `/api/admin/job-descriptions/{id}/evaluations` | GET/POST | `app/api/admin/job-descriptions/[id]/evaluations/route.ts` | Evaluation generation with AI |
| `/api/admin/candidates` | GET | `app/api/admin/candidates/route.ts` | Query param: `jobDescriptionId` |
| `/api/admin/candidates/{id}/cv-download` | GET | `app/api/admin/candidates/[id]/cv-download/route.ts` | 302 redirect to signed URL |
| `/api/admin/candidates/{id}/process` | POST | `app/api/admin/candidates/[id]/process/route.ts` | Triggers CV processing edge function |

#### Server Actions (Form-based, requires CSRF token from Next.js)
| Action | File | Auth Required |
|--------|------|--------------|
| `signIn()` | `app/auth/actions.ts` | No |
| `signOut()` | `app/auth/actions.ts` | Yes (session) |
| `adminAddUser()` | `app/admin/actions.ts` | Yes (HR) |

### Input Validation Patterns

Input validation is consistently applied across all network-accessible endpoints:
- **Path parameters:** UUID validation via regex (`/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`), numeric IDs via `Number()` + `Number.isInteger()` + bounds checking
- **Query parameters:** Type coercion with explicit validation, min-length checks (e.g., search query requires ≥2 chars)
- **Request bodies:** Zod schema validation on all POST/PUT handlers with strict field typing, enum validation for status fields, string length constraints (e.g., 32K max for notes, 120 chars for names, 200 chars for candidate names)
- **File uploads:** Extension-based validation only (not MIME type or magic bytes). Allowed: `.pdf`, `.docx` for CVs; `.pdf`, `.docx`, `.txt` for JDs; `.pdf` only for evaluation templates

**Security Gap:** File validation relies on filename extension only. An attacker could upload a malicious file with a `.pdf` extension but different content. However, files are stored in private Supabase Storage buckets and only downloaded via signed URLs, limiting the blast radius.

### Background Processing

The Supabase Edge Function `process-cv` (`supabase/functions/process-cv/index.ts`) runs on Deno runtime and is invoked via the Supabase Functions API from `app/api/admin/candidates/[id]/process/route.ts`. The edge function has `verify_jwt = false` in its configuration (line 379), meaning it handles JWT verification manually rather than relying on Supabase's built-in verification. It validates the Bearer token by calling `supabase.auth.getUser()` and checking `profiles.is_admin`. The function makes outbound HTTP requests to the AI Gateway API for CV parsing.

### Notable Out-of-Scope Components
- `scripts/apply-vercel-migrations.mjs` — Database migration script run during Vercel build process, not network-accessible
- `supabase/config.toml` — Local Supabase CLI configuration, not served by the application
- `eslint.config.mjs`, `postcss.config.mjs`, `tsconfig.json` — Build/dev tooling only

---

## 6. Infrastructure & Operational Security

### Secrets Management

**Critical Finding — Exposed Secrets:** The file `.env.local` contains production credentials:
- `SUPABASE_SECRET_KEY` — Service role JWT that bypasses all RLS policies
- `AI_GATEWAY_API_KEY` — Vercel AI Gateway API key (billable service)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Public anon key (by design)

**Git tracking status:** `.env.local` is **NOT tracked** by Git (confirmed via `git ls-files .env.local` returning empty). The `.gitignore` correctly excludes `.env*` files (except `.env.example`). This is an **informational finding** — the secrets exist on the local filesystem but are not committed to version control. However, if this development environment is compromised, these keys provide full database access.

**Environment variable access patterns:**
- `lib/supabase/env.ts` exports public URL and keys, falling back between `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `lib/supabase/admin.ts` creates a service role client using `SUPABASE_SECRET_KEY` (falling back to legacy `SUPABASE_SERVICE_ROLE_KEY`)
- `lib/ai/jd-cv-match.ts` accesses `AI_GATEWAY_API_KEY` for LLM calls
- No runtime validation at application startup — errors only surface when a secret is first used

### Configuration Security

**Missing Security Headers:** The application does not configure HTTP security headers. No CSP, HSTS, X-Frame-Options, X-Content-Type-Options, or Referrer-Policy headers are set in `next.config.ts` or middleware. The `next.config.ts` file is minimal (only contains a basic config export). In a Vercel deployment, some headers may be set at the infrastructure level, but this is not guaranteed without explicit configuration.

**Infrastructure Configuration:** No Nginx, Kubernetes, or CDN configuration files exist in the repository. The application relies entirely on Vercel's managed infrastructure for TLS termination, edge routing, and DDoS protection. No `vercel.json` with security headers was found.

**Supabase Auth Configuration** (`supabase/config.toml`):
- Minimum password length: 6 characters (line 174) — **weak**, should be 8+
- Password complexity requirements: none (`password_requirements = ""` line 178)
- Signup disabled: `enable_signup = false` (line 169)
- Email confirmations: disabled (line 208)
- Secure password change: disabled (`secure_password_change = false` line 211) — users can change passwords without re-authentication
- MFA: disabled (lines 280-301)

**Auth Rate Limits** (Supabase-enforced, `config.toml` lines 180-193):
- Email sent: 2/hour
- Sign in/sign ups: 30/5min per IP
- Token refresh: 150/5min per IP

### External Dependencies

| Service | Purpose | Security Implication |
|---------|---------|---------------------|
| Supabase Cloud | Database, Auth, Storage, Edge Functions | Complete reliance on Supabase security; service role key grants full access |
| Vercel AI Gateway | LLM routing to OpenAI/xAI | PII (email, phone, CV text) transmitted to external AI; no DPA documented |
| GitHub CDN / jsDelivr | Font loading fallback (`lib/evaluation/noto-fonts-for-pdf.ts`) | External HTTP requests to CDN; hardcoded URLs, no user control |
| Vercel | Hosting, TLS, edge routing | Managed infrastructure; no explicit security header configuration |

### Monitoring & Logging

**Critical Gap:** The application has **no structured logging or audit trail** for security-relevant events. Error logging is limited to `console.error` in development mode only (`process.env.NODE_ENV === "development"`). There is no logging of:
- Authentication attempts (success/failure)
- Authorization failures (403 responses)
- Candidate data access (who viewed which candidate)
- File downloads (CV/evaluation PDF access)
- Administrative actions (user creation, JD access grants)
- Evaluation preview token usage

Supabase analytics is configured for the postgres backend (`config.toml` line 372), but this provides database-level metrics only, not application-level security event visibility.

---

## 7. Overall Codebase Indexing

The SmartHire codebase follows a standard Next.js App Router structure with approximately 80+ source files organized under the root directory. The `app/` directory contains all page routes and API handlers: `app/api/admin/` houses 24+ API route handlers organized by resource (job-descriptions, candidates, chapters, etc.), `app/api/public/` contains the single unauthenticated endpoint, `app/auth/` handles login/signup pages and server actions, and `app/admin/` contains the protected admin dashboard pages. The `lib/` directory holds shared business logic organized by domain: `lib/admin/` (authorization functions), `lib/supabase/` (database client initialization), `lib/ai/` (LLM integration for extraction, matching, and evaluation), `lib/candidates/` (candidate data helpers and upload constants), `lib/jd/` (job description utilities), `lib/auth/` (email validation), and `lib/evaluation/` (PDF font loading). The `components/` directory contains reusable React UI components. The `supabase/` directory is critical for security review: `supabase/migrations/` contains 22 SQL migration files defining the complete database schema, RLS policies, storage bucket configurations, and auth triggers; `supabase/functions/process-cv/` contains the Deno-based edge function for CV processing; and `supabase/config.toml` defines authentication, storage, and rate limiting configuration. The `scripts/` directory contains a single Vercel migration helper. The `public/` directory serves static assets. Build orchestration uses standard npm scripts defined in `package.json`. No test framework or test files were found, which is a concern for validating RLS policy correctness. The codebase is relatively compact, making it feasible for a pen tester to review all API routes and authorization logic comprehensively.

---

## 8. Critical File Paths

### Configuration
- `supabase/config.toml` — Auth configuration, JWT expiry, rate limits, password policy, storage limits
- `next.config.ts` — Next.js configuration (minimal, no security headers)
- `package.json` — Dependencies and build scripts
- `.env.example` — Environment variable template (documents required secrets)
- `.env.local` — **UNTRACKED** local secrets file (informational: contains live Supabase + AI keys)
- `tsconfig.json` — TypeScript configuration

### Authentication & Authorization
- `middleware.ts` — Global request interceptor, session refresh, route-level auth enforcement
- `app/auth/actions.ts` — Sign-in/sign-out server actions, safe redirect validation
- `app/admin/actions.ts` — Admin user creation server action
- `lib/admin/config.ts` — `isProfileAdmin()`, `isProfileStaff()` role checking functions
- `lib/admin/profile-access.ts` — `getStaffProfileAccess()` resolves user's full permission set
- `lib/admin/require-admin-request.ts` — Admin-only API authorization guard
- `lib/admin/require-admin-api.ts` — `requireAdminApi()` for admin endpoints
- `lib/admin/require-staff-request.ts` — Staff/HR API authorization guard, Bearer token parsing
- `lib/auth/email.ts` — Email validation regex

### API & Routing
- `app/api/admin/job-descriptions/route.ts` — JD list/create endpoints
- `app/api/admin/job-descriptions/[id]/route.ts` — JD CRUD by ID
- `app/api/admin/job-descriptions/extract/route.ts` — AI-powered JD extraction
- `app/api/admin/job-descriptions/[id]/jd-download/route.ts` — JD file download (signed URL redirect)
- `app/api/admin/job-descriptions/[id]/candidate-status-counts/route.ts` — Pipeline status counts
- `app/api/admin/job-descriptions/[id]/pre-interview-note/route.ts` — Pre-interview notes CRUD
- `app/api/admin/job-descriptions/[id]/interview-notes/route.ts` — Interview notes list/create
- `app/api/admin/job-descriptions/[id]/evaluations/route.ts` — AI evaluation generation
- `app/api/admin/job-openings/route.ts` — Job openings list
- `app/api/admin/job-openings/sign-upload/route.ts` — JD file upload signing
- `app/api/admin/candidates/route.ts` — Candidates list
- `app/api/admin/candidates/sign-upload/route.ts` — CV upload signing
- `app/api/admin/candidates/[id]/route.ts` — Candidate PATCH/DELETE
- `app/api/admin/candidates/[id]/process/route.ts` — CV processing trigger
- `app/api/admin/candidates/[id]/cv-download/route.ts` — CV download (signed URL)
- `app/api/admin/candidates/[id]/timeline/route.ts` — Interview/onboarding timeline
- `app/api/admin/candidates/pipeline/route.ts` — Bulk pipeline status update
- `app/api/admin/chapters/route.ts` — Chapter creation
- `app/api/admin/chapters/[id]/route.ts` — Chapter deletion
- `app/api/admin/accounts/search/route.ts` — User email search (enumeration risk)
- `app/api/admin/candidate-evaluation-template/route.ts` — Template management
- `app/api/admin/candidate-evaluation-template/sign-upload/route.ts` — Template upload signing
- `app/api/admin/candidate-evaluation-template/commit/route.ts` — Template upload finalization
- `app/api/public/evaluation-preview/[token]/route.ts` — **PUBLIC** evaluation PDF preview

### Data Models & DB Interaction
- `supabase/migrations/20250402120000_init_profiles_username_auth.sql` — Profiles table, RLS, auth trigger
- `supabase/migrations/20260404120000_candidates_jobs_storage_realtime.sql` — Candidates table, job openings, storage buckets, realtime
- `supabase/migrations/20260404130000_job_descriptions_storage.sql` — JD storage bucket, RLS
- `supabase/migrations/20260404140000_job_descriptions_table.sql` — Job descriptions table, RLS
- `supabase/migrations/20260405130000_candidate_evaluation_template.sql` — Evaluation template table, storage
- `supabase/migrations/20260406150000_candidate_evaluation_reviews.sql` — Evaluation reviews, preview tokens
- `supabase/migrations/20260408120000_rbac_chapters_jd_viewers_interview_notes.sql` — Chapters, viewers, interview notes
- `supabase/migrations/20260408130000_rbac_rls_recruiter_read.sql` — Recruiter-scoped RLS policies
- `supabase/migrations/20260409100000_pipeline_candidate_pre_interview_notes.sql` — Pre-interview notes (RLS deferred to API)
- `supabase/migrations/20260409120000_chapters_profile_jd_viewer_chapters.sql` — Chapter-based viewer grants, complex RLS
- `supabase/migrations/20250403160000_seed_test_admin.sql` — **Test admin account with hardcoded credentials**

### Dependency Manifests
- `package.json` — npm dependencies
- `package-lock.json` — Locked dependency versions

### Sensitive Data & Secrets Handling
- `lib/supabase/env.ts` — Environment variable access for Supabase URL/keys
- `lib/supabase/admin.ts` — Service role client creation (bypasses RLS)
- `lib/supabase/client.ts` — Browser-side Supabase client
- `lib/supabase/server.ts` — Server-side Supabase client with cookie management
- `lib/candidates/parsed-contact.ts` — PII extraction from parsed CV payload

### AI Integration & External Data Flow
- `lib/ai/extract-jd.ts` — JD text extraction via AI (sends JD text to external LLM)
- `lib/ai/fill-candidate-evaluation.ts` — AI-generated evaluation PDF filling
- `lib/ai/jd-cv-match.ts` — CV-to-JD matching score (sends PII to AI)
- `supabase/functions/process-cv/index.ts` — Edge function: CV text extraction + AI parsing

### Middleware & Input Validation
- `lib/candidates/upload-constants.ts` — CV upload constraints (25MB, .pdf/.docx)
- `lib/jd/upload-constants.ts` — JD upload constraints (10MB, .pdf/.docx/.txt)
- `lib/admin/candidate-evaluation-template-constants.ts` — Template path validation regex
- `lib/candidates/jd-match.ts` — CV summary builder (includes PII in AI prompts)

### Infrastructure & Deployment
- `scripts/apply-vercel-migrations.mjs` — Vercel build migration script (out-of-scope)
- `lib/evaluation/noto-fonts-for-pdf.ts` — External font CDN fetching for PDF generation

---

## 9. XSS Sinks and Render Contexts

**Network Surface Focus:** This analysis covers only XSS sinks in web application pages served by the Next.js server, excluding build tools, CLI scripts, and non-network components.

### Assessment Summary

The SmartHire application demonstrates **strong XSS resistance** in its network-accessible code. The React 19 framework provides automatic output escaping for all JSX expressions, and the codebase avoids dangerous patterns that could bypass these protections.

### Findings

#### No Critical XSS Sinks Detected

After thorough analysis of all files under `app/`, `components/`, `lib/`, and `middleware.ts`:

- **`dangerouslySetInnerHTML`:** Not used anywhere in the codebase
- **Direct DOM manipulation (`innerHTML`, `outerHTML`, `document.write`):** Not found
- **`eval()`, `Function()`, string-based `setTimeout`/`setInterval`:** Not found
- **jQuery sinks:** jQuery is not a dependency
- **Dynamic script injection:** Not found

#### Low-Risk Observations

1. **Iframe with Dynamic Source** — `app/evaluation-preview/[token]/page.tsx` (lines 35-39)
   - **Sink:** `<iframe src={...}>` with dynamic URL constructed from route parameter
   - **Render Context:** URL Context (iframe `src` attribute)
   - **Data Flow:** The `token` path parameter is validated against `/^[0-9a-f]{48}$/i` (line 9) before being used in the iframe `src` URL (`/api/public/evaluation-preview/${token}`)
   - **Risk:** MINIMAL — Token is strictly validated to 48 hex characters only. No script injection possible through this vector.

2. **Dynamic Component Loading** — `app/admin/jd/[jobId]/pipeline/job-pipeline-spreadsheet-loader.tsx` (lines 7-10)
   - **Sink:** `next/dynamic` import
   - **Render Context:** Component loading
   - **Data Flow:** Module path is hardcoded (`"./job-pipeline-spreadsheet"`) — no user input in import path
   - **Risk:** NONE — Static import path, not user-controllable

3. **JSON Serialization in API Responses** — All `app/api/` route handlers
   - **Sink:** `Response.json({...})`
   - **Render Context:** JSON body (not rendered in HTML)
   - **Data Flow:** Database-sourced data returned as JSON. React components consuming this data use JSX expression escaping.
   - **Risk:** MINIMAL — JSON responses are consumed by React, which auto-escapes output. No raw HTML rendering of API data detected.

#### SQL Injection Assessment

- **No raw SQL queries** found in network-accessible code. All database operations use the Supabase SDK's parameterized query builder.
- **No `.rpc()` calls** with user-controlled parameters detected.
- **Type coercion** applied before all numeric parameters: `Number()` + `Number.isInteger()` + bounds checking.

#### Command Injection Assessment

- **No `child_process` usage** (`exec`, `execSync`, `spawn`, `execFile`) found in any source file.
- **No system command execution** of any kind in the codebase.

#### Template Injection Assessment

- **No server-side template engines** used. All rendering via React components.
- **PDF generation** uses `pdf-lib` field setters (not template-based), with field names validated against an allowlist in `lib/ai/fill-candidate-evaluation.ts` (lines 366-374).

#### Deserialization Assessment

- All JSON parsing in API routes is followed by **Zod schema validation** (e.g., `evaluations/route.ts` lines 15-25).
- The edge function `process-cv/index.ts` (lines 98-140) implements `safeParseParsedResume()` with strict type checking for each field.
- **No `pickle`, `unserialize`, `readObject`** or equivalent unsafe deserialization detected.

---

## 10. SSRF Sinks

**Network Surface Focus:** This analysis covers only SSRF sinks in server-side code that is network-accessible (API routes, server actions, middleware, edge functions). Client-side fetch calls, build scripts, and CLI tools are excluded.

### Assessment Summary

The SmartHire application makes **multiple outbound HTTP requests** from server-side code, primarily to the Vercel AI Gateway and Supabase Storage. While no classic SSRF vulnerability (user-controlled URL) was identified, several sinks transmit user-controlled **content** to external services, creating data leakage risks.

### SSRF Sinks Identified

#### 1. Vercel AI Gateway — JD Extraction (MEDIUM Severity)
- **File:** `lib/ai/extract-jd.ts` (lines 278-316)
- **Sink:** `generateText()` from Vercel AI SDK → HTTPS POST to `https://ai-gateway.vercel.sh/v1`
- **User-Controlled Data:** Job description text extracted from uploaded PDF/DOCX files (truncated to 14,000 characters at lines 83-90)
- **URL Control:** None — baseURL hardcoded in AI SDK configuration
- **SSRF Risk:** LOW — URL not user-controllable
- **Data Leakage Risk:** MEDIUM — Full JD text (potentially containing internal company information) sent to external service
- **Triggered By:** `POST /api/admin/job-descriptions/extract` (admin-only)

#### 2. Vercel AI Gateway — CV-JD Matching (MEDIUM Severity)
- **File:** `lib/ai/jd-cv-match.ts` (lines 43-74)
- **Sink:** `generateText()` → HTTPS POST to AI Gateway
- **User-Controlled Data:** CV summary text (including email, phone from `parsed_payload`) AND JD text, both from database
- **URL Control:** None — hardcoded baseURL
- **SSRF Risk:** LOW — URL not user-controllable
- **Data Leakage Risk:** HIGH — PII (email, phone numbers) from CV summaries sent to external AI. The `buildCvSummary()` function in `lib/candidates/jd-match.ts` (lines 13-39) explicitly includes `Email: ${p.email}` and `Phone: ${p.phone}` in the AI prompt.
- **Triggered By:** `POST /api/admin/candidates/{id}/process` (admin-only, via edge function callback)

#### 3. Vercel AI Gateway — Evaluation PDF Filling (MEDIUM Severity)
- **File:** `lib/ai/fill-candidate-evaluation.ts` (lines 86-116, 160-170)
- **Sink:** `generateText()` → HTTPS POST to AI Gateway
- **User-Controlled Data:** Candidate name, reviewer notes (free-form text up to 32K chars), interview notes
- **URL Control:** None — hardcoded baseURL
- **SSRF Risk:** LOW — URL not user-controllable
- **Data Leakage Risk:** HIGH — Reviewer notes and candidate information sent to external service
- **Triggered By:** `POST /api/admin/job-descriptions/{id}/evaluations` (staff-level)

#### 4. Supabase Edge Function — CV Processing (MEDIUM Severity)
- **File:** `supabase/functions/process-cv/index.ts` (lines 150-177, 202-209)
- **Sink:** `fetch(route.url, { method: "POST", ... })` — outbound HTTP request to AI endpoint
- **User-Controlled Data:** Extracted CV plaintext sent as request body
- **URL Control:** None — URL configured from environment variable, not user input
- **SSRF Risk:** LOW — Endpoint URL from server config
- **Data Leakage Risk:** MEDIUM — Full CV text (up to 14K chars) transmitted externally
- **Triggered By:** Invoked by `POST /api/admin/candidates/{id}/process` via Supabase Functions API

#### 5. Font CDN Loading (LOW Severity)
- **File:** `lib/evaluation/noto-fonts-for-pdf.ts` (lines 8-15, 20-46)
- **Sink:** `fetchWithTimeout(url, FETCH_MS)` — HTTP GET to external CDN
- **User-Controlled Data:** None — URLs hardcoded to GitHub raw content and jsDelivr CDN
- **URL Control:** None
- **SSRF Risk:** NONE — Hardcoded mirrors, no user influence
- **Data Leakage Risk:** NONE
- **Triggered By:** PDF evaluation generation (lazy-loaded, cached in memory)

#### 6. Supabase Storage Downloads (LOW Severity)
- **Files:**
  - `app/api/admin/job-descriptions/[id]/jd-download/route.ts` (lines 55-66)
  - `app/api/admin/candidates/[id]/cv-download/route.ts` (lines 44-55)
  - `app/api/public/evaluation-preview/[token]/route.ts` (lines 31-48)
  - `app/api/admin/job-descriptions/[id]/evaluations/route.ts` (lines 205-214)
- **Sink:** `supabase.storage.from(bucket).download(path)` and `createSignedUrl(path, ttl)`
- **User-Controlled Data:** Storage paths sourced from database lookups, not directly from user input
- **URL Control:** None — Supabase handles URL construction internally
- **SSRF Risk:** NONE — Paths come from DB, validated before use
- **Triggered By:** Various authenticated download endpoints

#### 7. Redirect Handler — Auth Actions (MITIGATED)
- **File:** `app/auth/actions.ts` (lines 11-16, 44-45)
- **Sink:** `redirect(safeNextPath(nextRaw))` — server-side redirect
- **User-Controlled Data:** `next` form parameter from sign-in form
- **URL Control:** MITIGATED — `safeNextPath()` validates: must start with `/`, must not start with `//`, must not contain `://`. Falls back to `/dashboard`.
- **SSRF Risk:** NONE — Redirect is to same-origin path only
- **Open Redirect Risk:** MITIGATED — Validation prevents protocol-relative and absolute URL redirects

### SSRF Protection Summary

| Protection Mechanism | Status | Notes |
|---------------------|--------|-------|
| URL hardcoding for external services | ✓ Present | AI Gateway and font CDN URLs are hardcoded |
| User input in URL construction | ✓ Not found | No endpoints allow user-controlled URLs in outbound requests |
| Internal IP blocklist | ✗ Not implemented | No SSRF-specific IP filtering (defense-in-depth gap) |
| Redirect validation | ✓ Present | `safeNextPath()` prevents open redirects |
| Request timeout | ✓ Partial | Font loading has 25s timeout; AI calls rely on SDK defaults |
