# Pipelines 2 — Change Log & Report

Branch: `feat/renewdesign` · Report date: 2026-10-14

## 1. Summary

Built out `/admin/pipelines-2`: a reusable **pipeline** (ordered list of library stages with per-stage time limit)
that every **new position** must select. Existing positions keep using `job_stage_mappings` and
`campaign_applied` untouched.

## 2. Requirements agreed

| Topic | Decision |
|---|---|
| Scope | New `pipelines` table; stage library = `pipeline_stages`; steps = `pipeline_sub_stages` |
| Jobs | `jobs.pipeline_id` nullable (legacy jobs stay valid); **new jobs require a pipeline** |
| Legacy data | `job_stage_mappings` / `campaign_applied` unchanged and still the source of truth for per-job stages and candidate progress |
| SLA | Default `sla_days = 5` |
| Usage counts | Removed (no jobs/candidates counts per pipeline) |
| Templates | None (no pipeline or stage templates) |
| Stage type | Free-text `stage_type` (none, schedule, offer, probation, …); `allow_schedule` kept and synced |
| Offer / Probation | Normal stages — no uniqueness or ordering rules |
| Step flags | `is_terminal`, `requires_reason`, `requires_decision`, `is_withdraw` (DB CHECK constraints dropped — validated in app code) |
| Migration process | Write migration, **ask user before running** |

## 3. Database — `migrations/1790100000000_pipelines.sql` (applied)

- `pipelines` (soft delete, unique lower(name) among live rows) and `pipeline_rows` (stage, sequence, `sla_days`, `schedule`).
- `jobs.pipeline_id` → `pipelines(id)` (nullable, `ON DELETE SET NULL`).
- `job_stage_mappings`: + `sla_days`, `schedule`, `pipeline_row_id` (all nullable; NULL = legacy mapping).
- `pipeline_stages.stage_type text NOT NULL DEFAULT 'none'`, backfilled (`schedule`, `offer`).
- `pipeline_sub_stages`: + four behaviour flag columns (default false).
- Down migration included.

## 4. Backend

**Data layer**
- `lib/db/pipelines.ts` — pipeline CRUD, `isPipelineUsable`, `applyPipelineToJob` (snapshots pipeline rows into `job_stage_mappings`, so later pipeline edits don't touch running jobs).
- `lib/db/pipeline-library.ts` — stage library CRUD with steps.
- `lib/pipelines/get-pipelines.ts` — loader used by the server layout.
- `lib/pipelines/schemas.ts` — zod schemas (pipeline create/update, library stage body incl. rules: exactly one entry step, ≥1 passing step, withdraw ⇒ terminal, entry/pass can't be terminal, unique step codes).
- `lib/db/pipeline-stages.ts`, `lib/db/jobs.ts` — extended for `stage_type` and `pipeline_id`.

**API routes** (writes are HR/admin only via `requireHrForRequest`)
- `/api/admin/pipelines/list` (GET, POST) and `/list/[pipelineId]` (PATCH, DELETE)
- `/api/admin/pipelines/library` (POST) and `/library/[code]` (PUT, DELETE)
- Legacy `/api/admin/pipelines` + `sub-stages` routes updated for new fields.

**Positions**
- `POST /api/admin/positions` now requires a valid `pipelineId` (400 otherwise).
- `lib/position/create-position.ts` applies the chosen pipeline instead of hard-coded default stages.
- `POST /api/admin/positions/[id]/duplicate` keeps the source's pipeline; legacy sources must supply `pipelineId`.

## 5. Frontend — `app/admin/pipelines-2/`

- `layout.tsx` (server): loads library, pipelines and the viewer from the session cookie.
- `pipelines-app.tsx`, `pipeline-list.tsx`, `stage-library.tsx`, `data.ts`, `pipelines.css`.
- Both screens wired to the real APIs (create / edit / delete pipelines; create / edit / delete library stages & steps).
- Nav: "Pipelines 2" added to the Work group (`lib/nav/menu.ts`), visible to HR/admin.
- Position creation/duplicate dialogs in `position-management-2` send `pipelineId`.

### UI follow-ups (this session)
1. **"View as" removed**; **real role check** — `viewer.canEdit = isHr` (admin or HR) derived server-side from the access token. Non-HR staff get a read-only UI; the server still enforces HR-only writes. (Library editing previously admin-only in UI; now matches server.)
2. **Add stage dropdown fix** — menu was clipped by the scrolling table. Now portalled to `document.body`, fixed-positioned, flips upward when space is short, max height 360px with scroll.
3. **Schedule field removed** from the create/edit pipeline dialog (column, switch, "library default" hint). The `schedule` value is still saved per row (library default); API unchanged.

### Open position + CV upload follow-ups
4. **Open new position** dialog has a required Pipeline select; `POST /api/admin/positions` attaches it (not changeable afterwards).
5. **Candidate stages on position pages** — the upload worker already assigns the entry stage/step to new applications, but the job-scoped list query returns NULL stage labels and legacy/unmoved rows have NULL ids, so the UI showed no stage. `listPositionCandidates` now resolves each candidate against the job's pipeline (`resolveCandidatePipelineIds`: first stage + entry step as fallback) and fills ids and labels. No migration.

## 6. Tests & checks

- `lib/pipelines/schemas.test.ts` (new, 9 tests), `lib/db/pipeline-stages.test.ts`, `lib/nav/menu.test.ts` updated.
- Vitest: 70 passing at last full run. 7 `resolveProfileConflict` tests fail — pre-existing, unrelated.
- `tsc --noEmit` and `eslint app/admin/pipelines-2` clean after the latest changes. Browser check of the latest UI tweaks not yet done.

## 7. Known gaps / follow-ups (out of scope so far)

- Legacy `/api/admin/job-descriptions` create path has no pipeline requirement.
- A job's pipeline can't be changed after creation.
- Duplicating a legacy position returns 400 until the UI sends `pipelineId`.
- Viewer name shows `username` (no full-name field in the access record).
- `schedule` still stored per pipeline row though no longer editable in the dialog.
- Optional: exactly-one-entry-step validation in old `components/admin/pipelines/stage-form.tsx`.
