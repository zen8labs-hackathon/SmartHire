# API gap analysis: old JD pipeline page vs. new `/dev/jobs`

## Context
The new Jobs UI (`app/dev/jobs`, mock data only) must be wired to real APIs. This plan (analysis only, no code changes) answers three questions:
1. Which APIs does the old page use today?
2. Which APIs does the new design need?
3. Which should be reused, extended or built new?

Notes on scope:
- `app/admin/jd/[id]` does not exist. The old UI is `app/admin/jd/[jobId]/pipeline` (+ `[candidateId]/evaluation`), the list `app/admin/jd`, and `components/admin/jd/*`.
- In the old UI `[candidateId]` and `/api/admin/candidates/[id]` mean `campaign_applied.id` (an **application**, not a person). Person id = `candidate_id`. Keep this distinction in new DTOs: the design's "candidate" row is an application.
- Epic references (E1–E9, F-codes) come from `artifacts/position_management/Position Management Plan.html`. Epics: E1 open position from JD, E2 list/access, E3 pipeline config, E4 CV intake, E5 screening/decisions, E6 offer/hire, E7 lifecycle/Talent pool, E8 analytics/rescore, E9 enablers (authz, audit, jobs, realtime).
- Common auth for all `app/api/admin/*`: `requireStaffForRequest`, then `requireJobViewAccess` / `requirePermissionOnJob("candidate.manage" | "job.manage")` / `requireAdministerJobAcl`. Salary redaction via `canViewSalary`.

---

## Part 1. APIs used by the old page (current state)

Prefix `/api/admin`. "Auth" = beyond staff.

### A. Job and candidate list
| # | Method + path | Used for | Key params -> response | Auth |
|---|---|---|---|---|
| A1 | GET `/job-descriptions/[id]/candidates` | Pipeline table, filters, sort, paging | `q, uploadFrom/To, stageMappingId, subStateId, parsingStatus, sortBy(experience/jdMatchScore/uploadDate), sortDir, limit<=200, offset, all` -> `{candidates, pagination}` | job view; salary redacted |
| A2 | GET `/job-descriptions/[id]/candidate-status-counts` | Stage/sub-stage chips and stat cards | -> `{counts[{stage_code, sub_stage_code, count}], total}` | job view |
| A3 | GET `/job-descriptions/[id]/jd-download` | JD file preview | 302 to signed URL (120s) | job view |
| A4 | GET `/job-descriptions` | Job list | `status,q,startFrom/To,limit,offset` -> `{jobDescriptions, pagination, statusCounts}` | visibility by user |
| A5 | GET `/job-descriptions/[id]` | Job detail, stages, viewers | -> job + `pipelineStages, viewerEmails, viewerChapterIds` | job view |

SSR loaders in `pipeline/page.tsx`: `getJobById` (`lib/db/jobs.ts:113`), `fetchCandidatesForJobDescription` -> `queryCandidatesList` -> `listCampaignAppliedForAdmin` (`lib/db/campaign-applied-list.ts:182`), `fetchJobPipelineConfig` (`lib/pipelines/transition-validator.ts:40`), `canViewJob`, `can(candidate.manage)`.

### B. Stage moves
| # | Method + path | Used for | Request -> response | Auth |
|---|---|---|---|---|
| B1 | POST `/candidates/pipeline` | Bulk/row stage move incl. Failed | `{jobId, updates[{id, current_job_stage_mapping_id, current_sub_state_id}]}` (1–100) -> `{ok, updated}`; validates via `validateAndBuildPipelineTransition`, sets `hiredAt` | `candidate.manage` |
| B2 | PATCH `/candidates/[id]` | Stage change in edit form | `{current_job_stage_mapping_id, current_sub_state_id}` | `candidate.manage` |
| B3 | GET `/candidates/pipeline-config?jobIds=` | Stage config for form | -> `{configs}` | job view |

### C. Candidate detail/edit/delete
| # | Method + path | Used for | Notes |
|---|---|---|---|
| C1 | GET `/candidates/[id]` | Edit modal, evaluation page | -> `{candidate, canViewSalary}` |
| C2 | DELETE `/candidates/[id]` | Delete application (`?scope=person` HR only) | soft delete |
| C3 | PATCH `/candidates/[id]/profile` | Edit profile fields; 409 `ProfileEditConflict` on email/phone clash | creates CV version; enqueues `rerun-ai-matching-edited` |
| C4 | PUT `/candidates/[id]/resolve-profile-conflict` | Merge after 409 | `lib/candidates/resolve-profile-conflict.ts` |
| C5 | GET `/candidates/[id]/cv-download` (`versionId, meta, proxy`) | CV preview | 302 signed URL / stream |

### D. Scoring
| # | Method + path | Used for | Notes |
|---|---|---|---|
| D1 | POST `/job-descriptions/[id]/candidates/rerun-ai-matching` | Run/retry AI JD match (bulk) | `{candidateIds(<=500)}` -> `{candidates, errorIds}`; BullMQ `fileUploadQueue`, dedup per application |
| D2 | GET/POST `/job-descriptions/[id]/requirements`, POST `.../requirements/re-extract` | Criteria list, re-extract | `re-extract` -> `{staleApplications}` |

### E. Upload and intake
| # | Method + path | Used for |
|---|---|---|
| E1 | POST `/upload-files/history/[jobId]` | Register batch (<=50 files, pdf/docx; server cap 50MB, UI 25MB) -> `{batchId, files}` |
| E2 | POST `/upload-files/sign-urls` | Presigned S3 PUT |
| E3 | POST `/upload-files/[id]/enqueue` `{jobId}` | Start `upload-cv` job; 409 if processing |
| E4 | PATCH `/upload-files/[id]/change-status` | Mark network failure |
| E5 | GET `/upload-files/history/[jobId]` (polled 5s) | Upload history (`status,batchId,fileName,limit,offset`) |
| E6 | GET `/upload-files/history/[jobId]/batch/[id]` | Batch progress (service only) |
| E7 | POST `/upload-files/retry` | Retry failed/stale rows |
| E8 | GET `/upload-files/[id]/candidate-applications` | "Already applied" list (filtered by viewable jobs) |
| E9 | POST `/candidates/manual/check-duplicate`, POST `/candidates/manual` | Manual entry, duplicate merge/create_new |

Gap: upload routes are staff-only, with **no per-job ACL check**.

### F. Interviews and notes
| # | Method + path | Used for |
|---|---|---|
| F1 | GET/PATCH/DELETE `/candidates/[id]/timeline` | Interview rounds (schedule, reschedule via `rescheduled_from_id`, cancel). Needs stage `allow_schedule`. |
| F2 | GET/POST/PATCH `/candidates/[id]/interview-notes` | Notes (author-only edit) |
| F3 | GET/PUT `/candidates/[id]/pre-interview-note` | Pre-interview note |
| F4 | GET/POST `/candidates/[id]/evaluations` | Evaluation PDF + public preview token |

### G. Job management (list page dashboard)
| # | Method + path | Used for |
|---|---|---|
| G1 | POST `/job-descriptions` | Create job (`requireCanCreateJobs`) |
| G2 | PUT `/job-descriptions/[id]` | Edit fields, status change (close/reopen; sets `end_date`), viewers (needs `requireAdministerJobAcl`) |
| G3 | DELETE `/job-descriptions/[id]` | Soft delete |
| G4 | POST `/job-descriptions/extract` `{storagePath}` | JD file -> fields (sync) |
| G5 | POST/DELETE `/job-openings/sign-upload` | JD file upload / cleanup |
| G6 | GET `/job-descriptions/evaluation-templates` | Template choice |
| G7 | GET `/accounts/search?q=` | Viewer picker |

### H. Not present in the old page
No board/kanban, headcount, activity feed, notifications, rejection reason, proposals, share links, overview stats, talent pool, or access-grant roles. Unread by the page but existing: `candidates/[id]/cv-history`, `restore-version`, `update-with-history`, `other-applications`, `applications`, `discard-duplicate`, `link-to-candidate`, `reassign-cv-version`, `pipelines/*`, `evaluation-template/*`, `jd-match/bulk` (not read; verify before reuse).

---

## Part 2. Features in new `/dev/jobs` that need APIs

Source: `app/dev/jobs/*` (data shapes in `data.ts`). Everything is mock now.

1. **Session/shell**: current user + role, nav counts, notifications (list, mark read, mark all read, deep link `[jobId, tab, candId]`, 403/404 on no access).
2. **Jobs list**: role-scoped list (HR all; Chapter Head own chapter; Recruiter shared; Interviewer assigned), status tabs with counts, search `q`/`#id`, type and chapter filter, sort, `daysLeft`/risk, `processing` state, `fresh` flag, Talent-pool pseudo-row, hold/reopen/duplicate/close row actions.
3. **Create position**: file (PDF/DOCX <=10MB) or blank, chapter, hire type, headcount 1–50; async pipeline upload -> extract -> LLM; completion notification; `processing` polling.
4. **Job header**: headcount edit (1..50, >= hired), close (revoke links, notify interviewers; 409 when offers/probation open), request review, open (draft), hold, reopen.
5. **Overview**: hiring progress, funnel (current count + cumulative "reached"), per-sub-stage counts, alerts (stale CV >7d, interview without note, proposals, scoring failed, attention items), match-band counts, CV sources (received vs passed scan), weekly upload flow, median time-to-hire.
6. **Candidates tab**: server filter/sort/page (stage:sub, band, source, scoring state, "waiting on me", preset), table + board, salary gating, interviewer-only-assigned, score hidden for interviewer until note submitted.
7. **Stage transitions**: forward only to next stage after `pass` sub; backward only from default sub; proposals when user can't decide; hire -> probation (start date, probation end, mentor reminder); undo; bulk move/assign/reject.
8. **Reject**: reason (enum + detail), keep in Talent pool, 10-minute undo, audit.
9. **Candidate drawer**:
   - Match: band, score, AI/rule components, model metadata, per-criterion result with evidence, override + revert with reason, rescore.
   - Applications: other applications, CV versions (view/compare).
   - History timeline with reason and actor.
   - Interview notes: per-round draft autosave, submit, reveal-after-submit rule, reminder.
10. **Share evaluation links**: create (expiry <=30d, recipient, include flags), list, revoke, real URL.
11. **Uploads**: upload dialog (destination job or pool, source required, <=50 files), progress tray (polling or push), needs-attention list (failed, duplicates, scoring, no-note interviews) with actions (retry, rescore, remind, resolve, compare), duplicate merge / create new, upload history with filters (result kind, by, source, range).
12. **JD & criteria tab**: structured fields with state (ai/edited/confirmed/missing) and page source, per-field edit/confirm, source-file download, criteria CRUD (req/importance/origin) with dirty flag + "Rescore N", scoring weights, review comment (Chapter Head -> HR), discriminatory-criteria enforcement server-side.
13. **Pipeline tab**: read stages; per-stage Scheduling toggle; evaluation template; two-confirmation offer->probation.
14. **Access tab**: grants (chapter, person, via, by, at, salary flag), add person (directory, role, primary), add chapter, revoke with affected count; audit.
15. **Cross-cutting**: audit log, role-scoped field masks, async job state, per-application event log, admin-access banner.

---

## Part 3. Comparison and decision

Legend: **REUSE** as-is, **EXTEND** existing route/loader, **NEW** route. Epic/feature refs from the Position Management Plan.

### 3.1 Reuse as-is (wrap with new DTO mapper in the UI service layer)
| New feature | Existing API | Epic |
|---|---|---|
| Job detail fetch | A5 GET `/job-descriptions/[id]` | E2 |
| JD source file view | A3 `jd-download` | E1 |
| Rerun scoring (bulk) | D1 `rerun-ai-matching` | E8 (F8.x) |
| CV view/download | C5 `cv-download` | E5 |
| Interview rounds schedule/cancel | F1 `timeline` | E5 |
| Upload: sign/register/enqueue/retry/history | E1–E8 | E4 |
| Duplicate check on manual add | E9 | E4 |
| Interview notes CRUD | F2 (+F3 pre-note) | E5 |
| Evaluation PDF | F4 | E5 |
| Edit profile + conflict merge | C3, C4 | E4/E5 |
| Criteria list / re-extract | D2 | E1 (F1.x) |
| JD extract + sign-upload | G4, G5 | E1 |
| Viewer search | G7 | E2 |

### 3.2 Extend existing
| New feature | Base | What to add | Epic |
|---|---|---|---|
| Jobs list | A4 | Add `type`, `chapter`, `sort`, per-status counts scoped to visibility, `hired/headcount`, `daysLeft`, `attention` count, `processing`, `fresh`, `owner`; a Talent-pool pseudo row | E2 (F2.1–2.3) |
| Candidates tab | A1 (+A2) | Filters `band[]`, `source[]`, `scoring`, `mine`, multi-stage "stage:sub"; return band/score/source/owner/salary(masked)/days-in-stage/hold/proposal; interviewer-assignment scoping; hide score for interviewer until note submitted | E5 (F5.x) |
| Stage counts / overview funnel | A2 | Add "reached" cumulative counts (needs stage-history table), per-sub counts | E8 |
| Stage move | B1 | Add rule: forward only after `pass` sub, backward only from `def`; `reason`; proposal mode; undo token; emit audit; reject/hire special cases | E5, E6 |
| Hire | B1 + `hiredAt` | Hire payload (start date, probation end), headcount counter, two-confirmation, mentor reminder job | E6 |
| Job create | G1, G4 | Blank draft mode, `type`, `headcount`, async extract status, `processing` field, creation notification | E1 (F1.1–1.6) |
| Job update | G2 | Headcount (1..50, >= hired), status transitions Hold/Reopen with `reason`, "request review" and review comment | E1, E7 |
| Close | G2 status | Dedicated close with `revokeLinks`, `notifyInterviewers`, 409 guard; move active candidates to pool | E7 |
| Upload batch | E1/E3 | Destination = pool (no job), `source` enum required, per-job ACL check, push/poll batch progress counts (`total, processed, parsed, existing, attention`) | E4 |
| Needs attention | E5 + status | Aggregated list endpoint (failed, duplicates, scoring failed, no-note interviews) + resolve action | E4 |
| Duplicate resolve | E8/E9 | Compare payload (name/email/phone/role/last application) + merge/create_new with reason for an uploaded file | E4 |
| Candidate drawer: history | `timeline`, `cv-history` | Unify into per-application event log with actor + reason | E5, E9 |
| CV versions | `cv-history`, `restore-version` | Wire to drawer; compare view | E5 |
| Applications tab | `candidates/[id]/other-applications` | Include stage/band/score/status, salary mask | E5/E7 |
| Pipeline tab | `pipeline-config` | Add `schedule`, `template`, `rounds` | E3 |
| Pipeline scheduling toggle | `pipelines/*` | Expose per-job override | E3 (F3.x) |
| Access grants | G2 `viewerEmails/viewerChapterIds` | Rich grants (role, via, by, at, salary, primary) | E2 (F2.4–2.5) |

### 3.3 Build new
| # | Proposed endpoint | Purpose | Request -> response | Rules | Epic |
|---|---|---|---|---|---|
| N1 | GET `/me` | Role, permissions, chapter, nav counts | -> `{user, role, caps{canCreate, canDecide, salary, hideScore}, counts}` | server-derived | E9 |
| N2 | GET `/notifications`; POST `/notifications/[id]/read`; POST `/notifications/read-all` | Bell | list `{id,title,body,time,unread,action,href}` | role-scoped; 403 on no-access link | E9 |
| N3 | GET `/jobs/[id]/overview` | Overview stats | -> `{progress, funnel{stage:{n,subs,reached}}, alerts[], bands, sources[{received,passed}], weeklyUploads[], tthMedian}` | server computed; at-risk threshold 21 days | E8 |
| N4 | POST `/job-descriptions/[id]/hold`, `/reopen`, `/close`, `/open`, `/request-review`, `/duplicate` | Lifecycle | `{reason}`, close `{revokeLinks, notifyInterviewers}` | 409 if offers/probation; HR-only close/duplicate | E7, E1 |
| N5 | GET `/job-descriptions/[id]/jd-fields`; PATCH `/jd-fields/[key]` | Structured fields with state + page source | `{key,value,state,source}` | state: ai/edited/confirmed/missing | E1 |
| N6 | PUT `/job-descriptions/[id]/criteria` | Replace criteria with importance/origin; return dirty/stale count | -> `{staleApplications}` | discriminatory text block | E1, E8 |
| N7 | POST `/job-descriptions/[id]/rescore` | Rescore all after criteria change | background job | E8 |
| N8 | POST `/job-descriptions/[id]/comments` | Chapter Head -> HR review comment | `{text}` | E1 |
| N9 | GET `/job-descriptions/[id]/attention`; POST `/attention/[id]/resolve` | Needs-attention | grouped list | E4 |
| N10 | POST `/candidates/[id]/reject`; POST `/candidates/[id]/reject/undo` | Reject with reason | `{reason, detail, keepInPool}` -> undo token (10 min) | audit | E5 |
| N11 | POST `/candidates/[id]/proposals`; POST `/proposals/[id]/decide` | Move proposals for non-deciders | `{to, reason}` | E5 |
| N12 | POST `/candidates/[id]/hire` | Hire -> probation | `{startDate, probationEnd}` | hired date immutable | E6 |
| N13 | POST `/candidates/bulk` | Bulk move / assign owner / reject | `{ids, action, ...}` | E5 |
| N14 | PUT `/candidates/[id]/criteria/[cid]/override`; DELETE to revert | Criterion override | `{status, reason}` | canDecide only | E5 |
| N15 | GET `/candidates/[id]/match` | Score breakdown, model metadata, rationale | -> `{band, score, ai, rule, weights, model, provider, at, criteria[]}` | hidden for interviewer until note submitted | E5, E8 |
| N16 | POST `/candidates/[id]/rescore` | Single rescore | async | E8 |
| N17 | PUT `/candidates/[id]/interview-notes/draft`; POST `.../submit`; POST `.../send-reminder` | Draft autosave, submit (unlock score), reminder | per round | other notes hidden until submit | E5 |
| N18 | GET/POST `/candidates/[id]/share-links`; DELETE `/share-links/[id]` | Evaluation share links | `{expiresInDays<=30, recipient, include{band, contact, salary}}` -> real URL | E5/E6 |
| N19 | GET `/job-descriptions/[id]/access`; POST; DELETE `/access/[grantId]` | Rich access grants | `{person|chapter, role, makePrimary}`; revoke returns affected count | audit; HR + Chapter Head | E2 |
| N20 | GET `/people`, GET `/chapters` | Directory for pickers | E2 |
| N21 | GET `/talent-pool/applications`; POST `/talent-pool/[candidateId]/move` | Pool list / move to position | `{positionId}` | E7 |
| N22 | GET `/job-descriptions/[id]/uploads` (history, filter kind/by/source/range) | Upload history with per-file result kind | kinds: new/existing/dup_job/suspected/failed/same_file | E4 |
| N23 | PATCH `/job-descriptions/[id]/pipeline/stages/[stage]` | Per-job scheduling override | `{schedule}` | HR | E3 |
| N24 | Audit-log writer + per-application event log table | Reasons for move/reject/override/access | cross-cutting | E9 |
| N25 | Async status channel (poll `GET .../status` or SSE) | JD extract, CV parse, scoring, upload batch | E9 |

### 3.4 Data model gaps (backing the new endpoints)
- Stage history / events (for "reached", history reasons, time-to-hire).
- Job: `type`, `headcount`, `hired_count`, `status` Hold, `processing`, review state.
- Application: `source`, `owner`, `hold`, `proposal`, reject reason, `keep_in_pool`.
- Criteria: `importance`, `origin`, per-application result with evidence + override.
- Notifications, share links, access grants (role, via, primary), JD field state, comments.

### 3.5 Risks and decisions to confirm before build
- Salary and score masking must be server-side (old code only redacts salary).
- Old upload routes lack per-job ACL; fix as part of reuse.
- Old stage rules (B1) are config-driven; new rules (forward-after-pass, back-from-default) must be encoded in `validateAndBuildPipelineTransition` or in config.
- Old criteria endpoints are read/re-extract only; no importance/origin editing.
- Mock includes a "Male, under 30" criterion; server must reject discriminatory criteria, not only warn.
- Verify unread routes (listed in H) before relying on them.
- Per AGENTS.md, check `node_modules/next/dist/docs/` before writing new route handlers.

## Suggested delivery order (by epic)
1. E9 foundations: N1, N2, N24, N25.
2. E2: A4/A1 extensions, N19, N20, N3 skeleton.
3. E1/E7: N4, N5, N6, N8, job create/update extensions.
4. E4: upload ACL, N9, N22, duplicate resolve.
5. E5/E6: N10–N18, stage-rule extension, N12.
6. E8: N3 full, N7, N15, N16.
7. E3, E7 Talent pool: N21, N23.

## Verification (when implemented)
- Per endpoint: route-level tests (vitest) for 401/403/404, role matrix (HR, Chapter Head, Recruiter, Interviewer), salary/score masking.
- Replace mock in `app/dev/jobs` with a typed service layer and use the "View as" switcher against real roles.
- Run `npm run dev` (`smarthire-dev`) and walk `/dev/jobs`: create, upload, move, reject + undo, hire, close, access.
