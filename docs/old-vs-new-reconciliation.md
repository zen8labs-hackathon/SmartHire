# Đối soát tính năng cũ vs mới & kế hoạch tách logic

Phạm vi: Position Management (cũ `/admin/jd` ↔ mới `/admin/position-management-2`), Pipeline (cũ `/admin/pipelines` ↔ mới `/admin/pipelines-2`), Scheduling/Calendar (lịch phỏng vấn cũ trong pipeline page ↔ `/admin/calendar-2`).
Nguồn: khảo sát code nhánh `feat/renewdesign` (git diff + migrations). Mức độ chắc chắn: cấu trúc file/route/migration đã xác nhận; chi tiết hành vi từng handler chỉ xác nhận ở các file có diff nêu bên dưới.

## 0. Kết luận nhanh

- **Tách UI đã khá rõ** (thư mục `-2` riêng, nav riêng trong `lib/nav/menu.ts`), nhưng **tách logic CHƯA đạt**: bản mới gọi thẳng các API `/api/admin/*` dùng chung và **sửa tại chỗ** các module lõi mà bản cũ cũng dùng → thay đổi hành vi của UI cũ.
- **Legacy data**: bản mới xử lý bằng cột nullable + fallback (xem mục 5). Không có bước migrate dữ liệu cũ sang cấu trúc mới, ngoại trừ vài backfill (hired_at, evaluation_due_at, stage_type).
- Rủi ro lớn nhất: (R1) đổi quy tắc `hired_at` áp dụng cho cả pipeline cũ; (R2) calendar-2 dùng chung bảng `candidate_schedules` với lịch cũ; (R3) `lib/position` vs `lib/positions` tên gần giống nhau, phụ thuộc chéo; (R4) `ScheduleDialog` (shared) import ngược từ `app/admin/calendar-2` và `position-management-2/ext`.

## 1. Position Management

| Hạng mục | Cũ | Mới (PM2) | Dùng chung / Ghi chú |
|---|---|---|---|
| Route UI | `app/admin/jd`, `jd/[jobId]/pipeline`, `.../[candidateId]/evaluation`, `app/admin/candidates`, `candidate-detail/[id]` | `app/admin/position-management-2/*` (+`[id]`, `my-interviews.tsx`) | Nav: `positions` vs `positions2` |
| Component | `components/admin/jd/*`, `components/admin/positions`, `components/admin/candidates/*` | Component nội bộ trong thư mục `-2` (`ext.tsx` là UI kit riêng) | PM2 import `components/admin/jd/manual-entry-from-upload-modal`, `candidates/cv-viewer` → **phụ thuộc chéo vào cũ** |
| API vị trí | `/api/admin/job-descriptions/**`, `/api/admin/upload-files/**` | `/api/admin/positions/**` (list, [id], transition, reprocess, request-review, access, criteria, rescore, candidates, cv-uploads/*) | `positions/route.ts` import cả `lib/position/create-position` lẫn `lib/positions/create-position` |
| API candidate | `/api/admin/candidates/pipeline`, `profile/[candidateId]/*` … | `/api/admin/candidates/[id]/{match,rescore,cv,profile,interview-notes,timeline,activity,applications,reject/undo}` | `candidates/[id]/route.ts` được **cả hai** gọi, đã bị sửa (xem mục 4) |
| Lib domain | `lib/jd/*`, `lib/service/candidate.service.ts`, `lib/positions/create-position.ts` | `lib/position/*` (create-position, transition, jd-state, cv-upload*, save-criteria, process-jd, list-position-candidates, …) | `lib/positions/create-position` (validator thuần dùng cho dialog cũ + server) được PM2 dùng lại; `lib/position/create-position` (server, DB) là mới |
| Tạo vị trí | `POST /api/admin/job-descriptions` (chấp nhận giá trị hire type tự do/legacy) | `POST /api/admin/positions` | Dùng chung `isHireType`, `validateHeadcount` |
| Trạng thái vị trí | Hold/Reopen/Close không bắt buộc lý do ("Legacy rule: only HR…" trong `lib/position/transition.ts`) | Hold/Reopen **bắt buộc reason** (AC-06-16), Close bị chặn nếu còn ứng viên offer/probation + lưu `close_snapshot` (BR-06-13) | `positions/[id]/transition` chỉ PM2 gọi (xác nhận cần grep) |
| Duplicate vị trí | — | Route `positions/[id]/duplicate` **đã xóa** (quyết định D3) | OK |
| DB | `jobs`, `campaign_applied`, `job_stage_mappings` | thêm `jobs.status_reason`, `jobs.close_snapshot` (mig `1792600000000`), `campaign_applied.start_date` (`1792500000000`), `entered_stage_at`, `candidate_stage_history`, `candidate_criterion_overrides` (`1791100000000`) | Cột mới nullable → hàng cũ giữ NULL |
| Thông báo interviewer khi hủy | Mặc định **bật** (không gửi flag) | Luôn gửi flag; mặc định **tắt** (D4) | `notify_interviewers` (PATCH) và `?notify=0|1` (DELETE) — cờ phân biệt client |
| Hiring (hired_at) | "stage cuối theo sequence + sub-stage `is_passed`" | "bất kỳ sub-stage của stage `stage_type='probation'`" | **Quy tắc thay đổi cho cả pipeline cũ** (R1); mig `1792500000000` backfill |

## 2. Pipeline

| Hạng mục | Cũ | Mới (Pipelines 2) | Dùng chung / Ghi chú |
|---|---|---|---|
| Route UI | `app/admin/pipelines/page.tsx` + `components/admin/pipeline-manager.tsx`, `components/admin/pipelines/` | `app/admin/pipelines-2/{pipeline-list,stage-library,pipelines-app}.tsx` | Nav `pipelines` vs `pipelines2` |
| Mô hình | Stage + sub-stage gắn trực tiếp vào job qua `job_stage_mappings` | `pipelines` + `pipeline_rows` (template), job **snapshot** rows vào `job_stage_mappings` khi apply | Mig `1791000000000_pipelines.sql` |
| API | `/api/admin/pipelines/{route,[id],sub-stages,sub-stages/[subId],sub-stages/reorder}` | `/api/admin/pipelines/{list,list/[pipelineId],library,library/[code]}` | `pipelines/[id]` và `library/[code]` bị sửa thêm BR-INT-13 (không tắt Schedule khi còn lịch sắp tới) – áp dụng cho cả hai |
| Lib | `lib/pipelines/*`, `lib/db/pipelines.ts`, `lib/db/pipeline-stages.ts` | `lib/db/pipeline-library.ts`, `lib/pipelines/reject-undo.ts`, `lib/candidates/resolve-application-stage.ts` | `transition-validator.ts` dùng chung và đã sửa (schedule/sla override, `isHiredStageMapping`, `isSchedulingEnabled`) |
| Cột mới | `pipeline_stages.stage_type` (none/schedule/offer/probation; `allow_schedule` giữ đồng bộ), `pipeline_sub_stages.{is_terminal,requires_reason,requires_decision,is_withdraw}`, `job_stage_mappings.{sla_days,schedule,pipeline_row_id}`, `jobs.pipeline_id` | | Backfill `stage_type` từ `allow_schedule`/code `offer` |
| Legacy | "job legacy" không có `pipeline_id` (NULL); `schedule`/`sla_days` NULL = không override; sub-stage flag mặc định false và validator cũ bỏ qua | | `applyPipeline` từ chối khi job là legacy hoặc đã có candidate (`JOB_HAS_STAGES`) |
| Stage Library | `pipeline_stages` + `pipeline_sub_stages` (toàn cục); job gắn stage trực tiếp qua `job_stage_mappings` | Cùng bảng đó, hiển thị/sửa ở `stage-library.tsx`; pipeline được tạo bằng cách **chọn stage từ Library** (`pipeline_rows.pipeline_stage_id`) | **Dùng chung, vẫn tồn tại sau release.** Sửa Library tác động cả hai luồng. Stage và pipeline đều được xoá mềm kể cả khi đang dùng (đã chốt; hiện code còn chặn `IN_USE` ở stage, cần bỏ khi implement). Quy tắc "xoá mềm nhưng đang dùng" (stage và pipeline như nhau): vẫn hiển thị nơi đang dùng, không CRUD ở UI quản lý, không chọn được cho job/pipeline mới – xem plan 2.1c |
| Stage hiển thị | Màu/nhãn theo `lib/candidates/pipeline-status-styles.ts` (có fallback `status` legacy "Offer/Matched/Rejected") | Dùng `resolve-application-stage` (ứng viên chưa từng move có stage id NULL → suy ra vị trí) | Cần chốt module nào là nguồn đúng |

## 3. Scheduling / Calendar

| Hạng mục | Cũ (schedule trong pipeline page) | Mới (Calendar-2) | Dùng chung / Ghi chú |
|---|---|---|---|
| UI | Modal lịch trong `components/admin/jd/jd-pipeline-modals.tsx` | `app/admin/calendar-2/*`, + `components/admin/schedule/schedule-dialog.tsx` | `ScheduleDialog` đặt ở `components/` nhưng import `calendar-2/api`, `calendar-2/data`, `position-management-2/ext`, CSS `cal.css` → **phụ thuộc ngược** (R4); được PM2 và calendar-2 dùng, cũ dùng modal riêng |
| API | `/api/admin/candidates/[id]/timeline` (+`no-show`) | `/api/admin/calendar/{route,hours,people,mine,busy,busy/[id],busy/preview,sessions/[id]/decline}`, `/api/internal/calendar/overdue` | `candidates/[id]/timeline` bị sửa nặng (+187 dòng): validation, conflict, notify, `calendarHref`; nhánh cũ "omits" flag nên vẫn gửi mail reschedule |
| Lib | `lib/db/candidate-schedules.ts`, `lib/service/candidate.service.ts` | `lib/calendar/{authz,busy,cascade,conflicts,evaluation,expand,notify,server,time,validation}.ts`, `lib/db/busy-blocks.ts`, `lib/db/company-settings` | `candidate-schedules.ts` dùng chung, thêm hàm mới (count upcoming, open evaluation seat, decline/withdraw) |
| DB | `candidate_schedules`, `candidate_schedule_interviewers` (mig `1783914205879`) | Thêm cột: `mode, meeting_link, note, cancel_reason, reschedule_reason, canceled_by/at, evaluation_due_at, no_interviewer_flag, soft_conflicts_acknowledged`; interviewer: `declined_at, decline_reason, evaluation_submitted_at, overdue_notified_at`; bảng mới `busy_blocks`, `company_settings` (mig `1792397373091`, `1792400000000`) | **Cùng bảng** (R2). Cột mới có DEFAULT (`mode='online'`) hoặc nullable; backfill `evaluation_due_at` |
| Legacy | Hàng lịch cũ không có mode/link/note → `online`; `busy_blocks.days = '{}'` ⇒ dùng thứ của `start_date` | | Xử lý bằng default + fallback trong `app/api/admin/calendar/busy/[id]/route.ts` |
| Thông báo | Notify mặc định bật | `lib/calendar/notify.ts` (+114 dòng), kênh Redis mới `lib/redis/channels.ts` | |

## 4. Điểm chạm chung (vector lan thay đổi từ mới → cũ)

| # | Module dùng chung | Thay đổi do bản mới | Ảnh hưởng UI cũ | Đề xuất |
|---|---|---|---|---|
| 1 | `lib/pipelines/transition-validator.ts` | `hired_at` theo `stage_type='probation'`; schedule/sla override | Ứng viên pipeline cũ nhận `hired_at` theo luật mới; job cũ không có stage probation sẽ **không còn hired_at** | Version hóa rule: `job.pipeline_id IS NULL` → rule cũ; ngược lại → rule mới |
| 2 | `app/api/admin/candidates/[id]/route.ts` | `start_date`, `cancel_upcoming_sessions`, `notify_interviewers`, resolve `from` stage | Cờ optional, default giữ hành vi cũ ✔ | Giữ, nhưng chuyển logic sang `lib/position/*` |
| 3 | `app/api/admin/candidates/[id]/timeline/route.ts` | Validation/conflict/notify lịch mới | Modal cũ đi qua cùng route | Tách route v2 hoặc namespace `/calendar/sessions` |
| 4 | `app/api/admin/pipelines/[id]`, `library/[code]` | BR-INT-13 | Cả hai UI bị chặn tắt schedule | Chấp nhận (quy tắc toàn cục hợp lý) – ghi vào spec |
| 5 | `lib/db/candidate-schedules.ts` | Decline/withdraw semantics (không còn COALESCE `declined_at`) | Cũ gọi lại decline có thể trả null thay vì bản ghi | Kiểm tra caller cũ |
| 6 | `lib/db/jobs.ts`, `lib/db/pipelines.ts`, `campaign-applied.ts` | Cột/field mới | Không phá | OK |
| 7 | `lib/candidates/activity.ts`, `match-view.ts` | Dựng activity/match cho dialog mới | Có thể dùng bởi trang cũ `candidate-detail` | Rà caller |
| 8 | `lib/position` vs `lib/positions` | Tên gần giống, import chéo (`lib/position/create-position` import `lib/positions/create-position`) | Nhầm lẫn khi tách | Đổi tên/di chuyển: validator thuần → `lib/position/create-position-rules.ts` |
| 9 | `ScheduleDialog` | Import từ `app/admin/*-2` | Component "shared" thực chất thuộc bản mới | Chuyển vào `app/admin/calendar-2/` hoặc `lib/ui` |
| 10 | `lib/nav/menu.ts` | Thêm 3 item | Không phá | Feature flag ẩn bản cũ/mới |

## 5. Cơ chế xử lý legacy data của bản mới (đã thấy trong code)

| Dữ liệu legacy | Cách bản mới xử lý | Nơi |
|---|---|---|
| Job không có pipeline (`jobs.pipeline_id` NULL) | Nullable; `applyPipelineToJob` từ chối (JOB_HAS_STAGES) | `lib/db/pipelines.ts`, mig 1791000000000 |
| `job_stage_mappings` không có `schedule/sla_days` | NULL = dùng mặc định của stage (`isSchedulingEnabled`) | `transition-validator.ts` |
| `pipeline_stages` cũ chưa có `stage_type` | Default `'none'` + backfill từ `allow_schedule`/`offer` | mig 1791000000000 |
| Sub-stage cũ chưa có flag | Default false | mig 1791000000000 |
| Application chưa từng move (stage id NULL) | `resolveCandidatePipelineIds` suy ra vị trí khi ghi history | `candidates/[id]/route.ts`, `resolve-application-stage.ts` |
| `candidate_stage_history` | Bắt đầu từ thời điểm deploy (không backfill) | mig 1791100000000 |
| Rationale AI dạng text cũ | `requirement_key` = text yêu cầu; đọc cả 2 wire format | `jd-match-rationale.ts` |
| Lịch cũ thiếu mode/evaluation_due_at | Default `online`; backfill due = start + duration + 24h | mig 1792397373091 |
| Busy block weekly cũ (`days=''{}''`) | Fallback thứ của `start_date` | `lib/db/busy-blocks.ts`, `busy/[id]/route.ts` |
| `hired_at` theo luật cũ | Backfill theo stage probation | mig 1792500000000 |
| Hire type tự do ("New hire", tiếng Việt) | `typePositionHireType`/`isHireType` | `lib/positions/create-position`, `job-descriptions/route.ts` |

Thiếu sót: không có cơ chế chuyển (migrate) job cũ sang pipeline mới, không có cờ "legacy vs v2" tường minh trên bản ghi (chỉ suy ra từ NULL). Hướng giải quyết: xem mục 8 và `docs/legacy-data-migration-plan.md`.

## 6. Kế hoạch tách logic (đề xuất)

1. **Quy ước ranh giới**: `lib/v2/*` hoặc giữ `lib/position`, `lib/calendar`, `lib/pipelines-v2`; UI `-2` chỉ gọi API namespace mới (`/api/admin/v2/...` hoặc `/positions`, `/calendar`, `/pipelines/list|library`). Cấm `app/admin/*-2` import `components/admin/jd|candidates` (thêm ESLint `no-restricted-imports`).
2. **Phase A – Gỡ rủi ro hành vi cũ** (ưu tiên): version hóa rule `hired_at` (#1); rà caller cũ của decline/withdraw (#5); đưa timeline route cũ về nhánh tương thích.
3. **Phase B – Tách API**: nhân đôi/ủy quyền `candidates/[id]` (PATCH/DELETE) và `timeline` sang route mới cho PM2; route cũ giữ nguyên hợp đồng, cùng gọi service chung trong `lib/*` (không để logic trong route).
4. **Phase C – Tách lib**: gộp `lib/positions` + `lib/position`; chuyển `ScheduleDialog` vào calendar-2; tách `candidate-schedules.ts` thành `core` (CRUD, dùng chung) và `calendar` (rule mới).
5. **Phase D – Dữ liệu**: thêm cột marker `jobs.flow_version smallint DEFAULT 1` và cơ chế chuyển do người dùng chủ động (mục 8), không backfill hàng loạt; test cho cả 2 luồng trên cùng dữ liệu.
6. **Phase E – Cắt cũ**: feature flag nav, sau đó xóa UI/API/logic *ghi* cũ khi PM2/Pipelines2/Calendar-2 đạt parity. Reader/fallback legacy được giữ để đọc dữ liệu chưa chuyển.

## 7. Việc cần xác minh thêm

- Grep caller thực tế của `positions/[id]/transition` (cũ có gọi không?).
- Hành vi chính xác modal lịch cũ trong `jd-pipeline-modals.tsx` so với `timeline` route sau thay đổi.
- Callers cũ của `lib/candidates/activity.ts` và `match-view.ts`.
- Có test hồi quy cho luồng cũ sau thay đổi `transition-validator.test.ts` (+131 dòng) hay không.

## 8. Chiến lược migration dữ liệu legacy (đã chốt)

Chi tiết: [legacy-data-migration-plan.md](legacy-data-migration-plan.md). Tóm tắt:

- **Người dùng chủ động chuyển** từng job một (không có chuyển hàng loạt) qua wizard chuyển đổi: người dùng chọn pipeline thay thế cho stage cũ, thấy thông báo lịch hẹn sẽ chuyển sang Calendar, rồi dry-run → xem diff → xác nhận → apply trong transaction → audit/rollback. Không migrate tự động hàng loạt.
- **Adopt tại chỗ**: gắn pipeline vào `job_stage_mappings` hiện có (không re-snapshot) để không phá FK của `campaign_applied`; cần hàm mới vì `applyPipelineToJob` từ chối job đã có mapping.
- **Stage Library dùng chung**: stage/sub-stage không bị migrate hay xoá khi bỏ code cũ; wizard chỉ đổi cách job tham chiếu chúng. Ràng buộc xoá và quy tắc cảnh báo khi Library đổi giữa dry-run và xác nhận: xem plan mục 2.1b.
- **Một chiều**: hệ thống mới chỉ có cơ chế chuyển đổi, không tích hợp ngược. Dữ liệu chưa chuyển giữ nguyên, đọc qua reader/fallback legacy (được giữ lại).
- **Job legacy (`flow_version = 1`)**: xem được, mọi thao tác ghi bị chặn kèm thông báo yêu cầu chuyển đổi. Job Closed không bắt buộc chuyển nhưng vẫn có luồng UI.
- **Không bịa dữ liệu**: `entered_stage_at` để trống, không seed `candidate_stage_history`, không tạo `status_reason`/`close_snapshot`.
- **Nhắc quá hạn**: bỏ qua lịch cũ bằng điều kiện mốc thời gian trong `listOverdueEvaluationSeats` (rủi ro nhắc hàng loạt, cần xử lý trước release).
- **`hired_at`**: HR chọn stage probation từng job, xem danh sách ứng viên bị đổi rồi mới xác nhận.
