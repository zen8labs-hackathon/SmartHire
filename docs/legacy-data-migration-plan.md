# Kế hoạch migration dữ liệu cũ → cấu trúc mới (Position / Pipeline / Calendar)

Bối cảnh: release kế tiếp **xóa hoàn toàn** UI/API/logic cũ (`/admin/jd`, `/admin/pipelines`, modal lịch trong pipeline page). Vì vậy mọi dữ liệu "legacy" phải được chuyển sang cấu trúc mới trước cutover, có **admin/HR xác nhận thủ công**. Tài liệu này là kế hoạch, chưa có code nào được thay đổi.

Căn cứ: migrations `1783914201953`…`1792600000000`, `lib/db/pipelines.ts` (`applyPipelineToJob`), `lib/db/candidate-schedules.ts`. Mục nào chưa kiểm chứng bằng cách chạy trên DB thật được ghi rõ.

## 0. Nguyên tắc

1. **Adopt tại chỗ, không re-snapshot.** `campaign_applied.current_job_stage_mapping_id` trỏ vào `job_stage_mappings`. Nên chuyển job cũ bằng cách *gắn* pipeline vào mapping hiện có (UPDATE `sla_days/schedule/pipeline_row_id`), tuyệt đối không xóa/tạo lại mapping.
2. **Người dùng chủ động chuyển, TỪNG JOB MỘT (position by position). Không có chuyển hàng loạt dưới mọi hình thức (không tick nhiều job, không "chuyển tất cả", không script chạy gộp), không chạy khi deploy.** Mỗi lần chuyển một job: người dùng chọn pipeline thay thế → dry-run → xem diff → xác nhận → apply trong 1 transaction → ghi audit. API chuyển nhận đúng một `jobId`.
2b. **Một chiều, không tích hợp ngược.** Hệ thống mới chỉ có cơ chế chuyển đổi; dữ liệu legacy chưa chuyển được giữ nguyên (không bịa lịch sử, không backfill thêm) và vẫn đọc được qua các reader/fallback legacy (được giữ lại).
3. **Idempotent, một chiều (không rollback).** Quyết định: không có rollback trong app. Snapshot giá trị cũ vẫn được lưu trong `legacy_migrations` chỉ để audit / khôi phục thủ công qua DB.
4. **Migration schema (DDL) tách khỏi migration dữ liệu.** DDL chạy trong `npm run db:migrate`; dữ liệu chạy qua màn hình admin hoặc script có kiểm soát (tránh giữ lock lâu trong deploy).
5. **Cutover không đòi hỏi mọi job phải được chuyển.** Job chưa chuyển vẫn tồn tại ở trạng thái legacy chỉ đọc; thao tác ghi bị chặn kèm thông báo yêu cầu chuyển đổi (mục 6).

## 1. Cơ chế chung: "Migration Center" (admin)

### 1.1 Bảng theo dõi (đề xuất)

```
legacy_migrations (
  id bigint identity PK,
  entity_type text,        -- 'job_pipeline' | 'job_status' | 'hire_type' | 'schedule' | ...
  entity_id   uuid/text,
  status      text,        -- pending | previewed | applied | skipped | failed | rolled_back
  plan        jsonb,       -- đề xuất của hệ thống (đã sinh ở bước dry-run)
  decision    jsonb,       -- lựa chọn của HR (override)
  snapshot    jsonb,       -- giá trị cũ để rollback
  confirmed_by uuid, confirmed_at timestamptz, error text
)
jobs.flow_version smallint NOT NULL DEFAULT 1   -- 1 = legacy, 2 = đã/đang theo luồng mới (job tạo mới = 2)
```

`flow_version` thay cho việc suy luận từ NULL. Backfill 1 cho mọi job hiện có, job mới tạo ở PM2 ghi 2. Sau khi migrate một job → set 2.

### 1.2 Quyền và luồng

- Chỉ role admin/HR có quyền `migration.manage` (thêm vào permissions catalog).
- Màn hình: danh sách job legacy + trạng thái (chỉ để theo dõi tiến độ, **không có checkbox chọn nhiều, không có thao tác hàng loạt**); mở từng job → wizard chuyển đổi (mục 1.3) → xem **bảng trước/sau** → xác nhận.
- Job `flow_version = 1` (kể cả job Closed) vẫn mở xem được; mọi thao tác ghi (đổi stage, đặt lịch, đóng/mở, sửa) bị **chặn** với banner/thông báo "Job này dùng cấu trúc cũ, cần chuyển đổi" kèm nút dẫn tới luồng chuyển.

### 1.3 Trải nghiệm UI khi job đang ở legacy flow (HR/Admin dùng giao diện mới)

Phần này là đề xuất thiết kế, chưa có code.

**Đọc (không chặn):**
- Danh sách Position: job legacy hiện bình thường, thêm badge "Cấu trúc cũ" (lọc được).
- Trang chi tiết job và drawer ứng viên: xem được stage hiện tại, lịch sử, lịch hẹn, ghi chú, đánh giá bằng các reader legacy được giữ lại.
- Banner cố định đầu trang job: "Job này dùng cấu trúc cũ. Cần chuyển đổi để chỉnh sửa." + nút **Chuyển đổi job này**.

**Ghi (bị chặn):** đổi stage/hire/reject ứng viên, đặt hoặc sửa lịch, đóng/mở/tạm dừng, sửa headcount/deadline/thông tin job, upload CV. Các nút ở trạng thái disabled + tooltip "Cần chuyển đổi job trước"; bấm vào mở thẳng wizard. Ở backend, API ghi trả mã lỗi riêng (ví dụ `JOB_LEGACY_FLOW`, HTTP 409) để UI và client khác xử lý thống nhất; không chỉ chặn ở UI.

**Wizard chuyển đổi (một job, 4 bước):**
1. **Chọn pipeline thay thế** (bắt buộc). Hiển thị các stage hiện tại của job (kèm số ứng viên mỗi stage) và danh sách pipeline trong thư viện. Gợi ý pipeline trùng khớp nhất với bộ stage hiện có, nhưng người dùng tự chọn; không tự tạo pipeline. Chỉ liệt kê pipeline còn sống (chưa xoá mềm) và có ít nhất một dòng. **Nếu không có pipeline phù hợp:** wizard hiển thị bộ stage cần có (mã, thứ tự) và nút "Mở trang Pipelines" để HR tự tạo pipeline từ các stage trong Stage Library, rồi quay lại wizard (trạng thái ghép đã chọn được giữ). Hệ thống không tạo hộ.
2. **Ghép stage cũ → bước của pipeline mới.** Mỗi stage cũ của job phải ghép vào một bước của pipeline đã chọn (gợi ý sẵn theo stage trùng mã). Stage cũ đang có ứng viên mà chưa ghép được thì không cho tiếp tục. Pipeline mới có bước không ghép với stage nào thì vẫn hợp lệ (bước mới, chưa có ứng viên).
3. **Lịch hẹn và Calendar.** Thông báo rõ: "Các lịch hẹn phỏng vấn của job này sẽ được chuyển sang tính năng Calendar của hệ thống." Liệt kê số lịch sẽ chuyển theo trạng thái; hình thức mặc định `online` (lịch có địa điểm mà không có link đề xuất `office`, cho người dùng chỉnh); đánh giá cũ được khớp vào interviewer đã nộp; lịch cũ không phát sinh nhắc quá hạn (mục 4.1). Nếu job có stage probation: chọn stage probation và xem ứng viên có `hired_at` thay đổi (mục 2.3).
4. **Xem trước và xác nhận.** Bảng trước/sau: stage mỗi ứng viên, SLA, bước phỏng vấn, lịch hẹn, `hired_at`. Bấm **Xác nhận chuyển đổi** → chạy trong 1 transaction; xong job chuyển `flow_version = 2` và mở khóa thao tác ghi. Có nút hoàn tác trong Migration Center cho từng job (chỉ khi chưa có thao tác mới làm thay đổi dữ liệu liên quan; điều kiện cụ thể cần chốt).

## 2. Track A — Pipeline (ưu tiên 1, các track khác phụ thuộc)

### 2.1 Dữ liệu cũ và đích

| Cũ | Đích | Cách chuyển |
|---|---|---|
| Job có `job_stage_mappings` tự chọn, `jobs.pipeline_id IS NULL` | `jobs.pipeline_id` + `pipelines` + `pipeline_rows` | Xem 2.2 |
| `job_stage_mappings.{sla_days, schedule, pipeline_row_id}` = NULL | Có giá trị | `sla_days` = mặc định 5 hoặc HR nhập; `schedule` = `pipeline_stages.allow_schedule`; `pipeline_row_id` = row mới tạo |
| `pipeline_stages.stage_type` | Đã backfill (`schedule`/`offer`, còn lại `none`) | **Probation chưa có stage nào được backfill** → HR gán thủ công (2.3) |
| `pipeline_sub_stages` flags (`is_terminal`, `requires_reason`, `requires_decision`, `is_withdraw`) = false | Cờ đúng ngữ nghĩa | HR rà một lần ở Stage Library (global, làm **trước** khi migrate job) |
| `campaign_applied` stage NULL / chưa từng move | `resolveCandidatePipelineIds` đã suy ra khi move | Không cần chuyển |

### 2.1b Stage Library là lớp dùng chung (đã kiểm chứng bằng code)

- `pipeline_stages` và `pipeline_sub_stages` (Stage Library) là dữ liệu **toàn cục**, vẫn tồn tại sau release. Luồng cũ gắn stage/sub-stage trực tiếp vào job qua `job_stage_mappings`; luồng mới tạo `pipelines` bằng cách chọn stage từ Library (`pipeline_rows.pipeline_stage_id NOT NULL`; `replacePipelineRows` chỉ nhận stage còn sống). Migration **không sao chép hay đổi stage/sub-stage**, chỉ đổi cách job tham chiếu chúng.
- **Quyết định đã chốt (phương án "cho xoá mềm"):** stage và pipeline đều được xoá mềm kể cả khi còn nơi đang dùng; mục đã xoá chuyển sang trạng thái "đã xoá, vẫn hiển thị nơi đang dùng" theo mục 2.1c. Hệ quả cho code (chưa làm, ghi nhận để implement sau khi được đồng ý):
  - Bỏ chặn `IN_USE` trong `deleteLibraryStage` (`lib/db/pipeline-library.ts`) (hiện chặn khi còn pipeline row còn sống hoặc `job_stage_mappings` active dùng stage). UI Stage Library đổi cảnh báo xoá tương ứng.
  - Pipeline giữ nguyên hành vi hiện tại (`softDeletePipeline` và route DELETE không chặn; job giữ snapshot và `jobs.pipeline_id`).
  - Vì vậy "job legacy có mapping trỏ tới stage đã xoá mềm" trở thành **trường hợp bình thường**, không còn là ngoại lệ hiếm. Wizard xử lý như sau: vẫn hiển thị stage đã xoá trong bảng ghép (kèm nhãn "đã xoá"), nhưng stage đó không thể là đích vì pipeline mới chỉ chứa stage còn sống; HR phải ghép nó sang một stage của pipeline đã chọn (remap, theo quy tắc sub-stage ở 2.2) hoặc khôi phục stage trong Library trước. Bước xác nhận bị chặn khi còn dòng chưa ghép.
  - Cần thêm chức năng khôi phục (undelete) stage/pipeline trong UI quản lý hoặc chấp nhận chỉ khôi phục bằng DB; chốt khi implement.
- **Sửa Library là tác động toàn cục lên cả job legacy lẫn job mới** (đổi nhãn, `stage_type`, cờ sub-stage, thêm/xoá sub-stage, ví dụ BR-INT-13). Quy tắc: (a) rà Library trước khi migrate (P0); (b) dry-run ghi lại phiên bản stage/sub-stage (`updated_at`) và bước xác nhận từ chối nếu stage hoặc sub-stage liên quan đã đổi sau dry-run, yêu cầu chạy lại dry-run; (c) đổi `stage_type` phải liệt kê job bị ảnh hưởng (xem 2.3).

### 2.1c Quy tắc "xoá mềm nhưng đang được dùng" (stage và pipeline áp dụng như nhau)

Quy tắc đã chốt cho cả `pipeline_stages` và `pipelines`: khi một mục bị xoá mềm mà vẫn còn nơi tham chiếu (job, pipeline, mapping):

1. **Vẫn hiển thị** ở những nơi đang dùng nó (chi tiết job, bảng stage của job, candidate, pipeline còn tham chiếu stage đó), kèm nhãn "đã xoá".
2. **Không cho CRUD** ở UI quản lý Pipeline và Stage Library: không sửa, không đổi thứ tự/SLA/cờ, không thêm sub-stage hay gắn thêm.
3. **Không cho chọn** khi tạo mới: không xuất hiện trong lựa chọn pipeline lúc tạo job (position) hay lúc đổi pipeline, và không xuất hiện trong lựa chọn stage lúc tạo/sửa pipeline. Wizard migration cũng chỉ liệt kê pipeline/stage còn sống.

Hiện trạng code so với quy tắc:
- Đã đúng: chọn pipeline (`isPipelineUsable`, `applyPipelineToJob`) và chọn stage khi lưu pipeline (`replacePipelineRows`) chỉ nhận mục chưa xoá; `listPipelines` và `listLibraryStages` chỉ trả mục chưa xoá.
- Cần xác minh/sửa khi implement (chưa làm): (a) các truy vấn đọc stage/pipeline của job đã có mapping hoặc `pipeline_id` trỏ tới mục đã xoá phải vẫn trả về và hiển thị (không JOIN lọc `deleted_at IS NULL`), (b) UI quản lý phải hiện mục đã xoá-nhưng-đang-dùng ở chế độ chỉ đọc hoặc ẩn khỏi danh sách quản lý tuỳ quyết định, (c) route PATCH/PUT/DELETE của stage, sub-stage, pipeline phải từ chối mục đã xoá (hiện đã lọc `deleted_at IS NULL` nên trả NOT_FOUND).
- **Đã chốt:** cho phép xoá mềm mục đang được dùng, áp dụng cùng một cách cho stage và pipeline (thay vì chặn cứng). Việc bỏ chặn `IN_USE` của stage và các điều chỉnh truy vấn/UI ở trên là việc implement sau, cần báo trước khi làm.

### 2.2 Thuật toán gom pipeline

**Người dùng chọn pipeline thay thế có sẵn trong thư viện cho từng job; hệ thống không tự gom signature và không tự tạo pipeline** (đã thay thế cách gom tự động của bản trước, vì chuyển hàng loạt không còn được phép). Dry-run chỉ dùng signature để *gợi ý* pipeline gần nhất.

1. Đầu vào: `jobId` + `pipelineId` + bảng ghép *stage cũ → pipeline_row mới* (mỗi `job_stage_mappings` đang active ghép vào đúng một row).
2. Nếu bộ stage cũ trùng khít pipeline đã chọn (cùng stage, cùng thứ tự): **adopt tại chỗ** — UPDATE mapping gắn `pipeline_row_id`, `sla_days`, `schedule` theo row; không đổi `campaign_applied`.
3. Nếu khác nhau: tạo mapping mới theo pipeline (giống `applyPipelineToJob`), **chuyển con trỏ** `campaign_applied.current_job_stage_mapping_id` từ mapping cũ sang mapping mới theo bảng ghép, rồi soft-delete mapping cũ. Snapshot lại ánh xạ cũ → mới để rollback.
4. Apply trong 1 transaction, `SELECT … FOR UPDATE` job; `UPDATE jobs SET pipeline_id, flow_version = 2`.
5. Cần hàm mới kiểu `adoptPipelineForLegacyJob` — **không** dùng `applyPipelineToJob` vì hàm này cố tình từ chối job đã có mapping (`JOB_HAS_STAGES`).

Đã kiểm chứng (sub-stage):
- `campaign_applied` lưu 2 con trỏ độc lập: `current_job_stage_mapping_id` (→ `job_stage_mappings`, theo từng job) và `current_sub_state_id` (→ `pipeline_sub_stages`, toàn cục).
- `pipeline_sub_stages.pipeline_stage_id` gắn sub-stage vào đúng một `pipeline_stages` (toàn cục, không theo job). Sub-stage KHÔNG nằm trong pipeline/job nên pipeline mới không đổi sub-stage.
- Hệ quả: nếu stage cũ và hàng pipeline mới trỏ cùng `pipeline_stage_id` (adopt-in-place hoặc ghép cùng stage) thì `current_sub_state_id` giữ nguyên, không cần ghép sub-stage.
- Nếu ứng viên bị chuyển sang stage KHÁC `pipeline_stage_id`, `current_sub_state_id` cũ sẽ thuộc stage khác và không hợp lệ (code chỉ tự sửa khi sub-stage đã xoá mềm, `recoverLivePipelineIds` trong `lib/pipelines/transition-validator.ts`; không kiểm tra sub-stage có thuộc stage của mapping hay không). Vì vậy bước remap phải gán lại sub-stage: ưu tiên sub-stage cùng `code` trong stage đích, nếu không có thì dùng sub-stage `is_default` của stage đích; hiển thị trong bước xem trước (diff) để người dùng xác nhận.
- Wizard chỉ cần cột "sub-stage sau chuyển" dạng chỉ-đọc/đổi được cho các dòng ghép khác stage; các dòng ghép cùng stage không cần hỏi.

Ràng buộc cần kiểm tra khi dry-run: `UNIQUE (pipeline_id, sequence_number)`; job có mapping trùng stage; mapping đã `deleted_at` nhưng vẫn được `campaign_applied` trỏ tới (cảnh báo, chặn).

### 2.3 Quy tắc `hired_at` (R1) — cần HR xác nhận

Luật cũ: hired khi ở stage cuối + sub-stage `is_passed`. Luật mới: sub-stage bất kỳ của stage `stage_type='probation'`. Migration `1792500000000` chỉ backfill những đơn **đang** ở stage probation, nên job cũ chưa có stage probation sẽ không còn `hired_at` đúng.

Bước cho từng job:
1. HR chọn stage nào là `probation` (thường là stage cuối); hệ thống đặt `stage_type='probation'`. Lưu ý `pipeline_stages` là **global** nên đổi stage_type ảnh hưởng mọi job dùng stage đó → dry-run phải liệt kê job bị ảnh hưởng.
2. Dry-run tính lại `hired_at` theo luật mới và hiển thị **danh sách ứng viên sẽ đổi** (có/không `hired_at` trước và sau).
3. HR xác nhận mới ghi; snapshot `hired_at` cũ để rollback.

## 3. Track B — Position Management

| Cũ | Đích | Cách chuyển / quyết định HR |
|---|---|---|
| `jobs.hire_type` text tự do (kể cả tiếng Việt) | Enum hire type | Quét giá trị khác nhau, đề xuất map (`LEGACY_HIRE_TYPE_VI_TO_EN`); giá trị không map được → HR chọn trong danh sách; ghi đè cột |
| `jobs.status` Hold/Closed không có lý do | `status_reason` bắt buộc (AC-06-16) | Giữ nguyên NULL. **Không bịa lý do**; UI hiển thị "Không có dữ liệu (legacy)" |
| Job Closed cũ | `close_snapshot` (BR-06-13) | Job Closed **không bắt buộc chuyển**; giữ nguyên, không dựng snapshot. Nếu người dùng chủ động chuyển thì vẫn qua luồng UI chung |
| `campaign_applied.entered_stage_at` NULL | Dùng cho SLA/aging | **Để trống (NULL)**, UI hiển thị "—", không tính SLA/aging cho đơn cũ |
| `campaign_applied.start_date` NULL (đơn đã hired) | Ngày bắt đầu thử việc | HR nhập trong bước xác nhận Track A 2.3 (tùy chọn) |
| `candidate_stage_history` trống cho đơn cũ | Timeline/Activity tab | **Giữ nguyên, không seed baseline, không suy ra lịch sử.** Timeline của đơn cũ hiển thị trống/dữ liệu legacy sẵn có |
| `job_requirements` / `criteria` | Đã tách bảng ở `1788930234004` | **Giữ reader hai định dạng**, không convert dữ liệu |
| `candidate_criterion_overrides` / rationale dạng text | `requirement_key` = id | **Giữ hỗ trợ đọc cả hai**, không convert |
| Duplicate position, Proposal | Đã bỏ (D1, D3) | Không có dữ liệu cần chuyển |

## 4. Track C — Calendar / Schedule

| Cũ | Đích | Cách chuyển |
|---|---|---|
| `candidate_schedules` không có `mode/meeting_link/note` | `mode` NOT NULL default `online` | Mặc định `online`. Heuristic đề xuất: `location` có giá trị mà không có link → `office`; HR duyệt danh sách ngoại lệ trước khi ghi |
| `candidate_schedules.evaluation_due_at` | Đã backfill cho **mọi** lịch (`scheduled_at + duration + 24h`) | **Rủi ro cần xử lý ngay, xem 4.1** |
| `candidate_schedule_interviewers.{declined_at, evaluation_submitted_at, overdue_notified_at}` NULL | Dùng cho nhắc quá hạn / ẩn AI-match | Xem 4.1 |
| `candidate_evaluation_reviews` (đánh giá PDF cũ) | `evaluation_submitted_at` của interviewer | Khớp theo `campaign_applied_id` (+ thời gian gần lịch) để đánh dấu đã nộp; khớp mơ hồ → HR duyệt |
| Busy block weekly cũ (`days = '{}'`) | `days` đủ dữ liệu | Backfill `days = ARRAY[EXTRACT(dow FROM start_date)]` một lần rồi bỏ fallback — hoặc giữ fallback |
| Lịch cũ không có `company_settings` | Giờ làm việc công ty | Đã seed; kiểm tra có giá trị |
| `candidate_notes` (type interview/pre_interview) | Interview notes tab | Cùng bảng, không cần chuyển |

### 4.1 Rủi ro: nhắc quá hạn hàng loạt cho lịch cũ (đã xác nhận bằng code, chưa chạy thử)

`1792397373091` backfill `evaluation_due_at` cho mọi lịch cũ, nhưng `evaluation_submitted_at` của interviewer để NULL. `listOverdueEvaluationSeats` (`lib/db/candidate-schedules.ts:503`) chọn mọi seat có `evaluation_due_at < now`, trạng thái `Scheduled/Confirmed/Completed`, chưa nộp, chưa decline, chưa notify. Khi job cron `/api/internal/calendar/overdue` chạy, **mọi interviewer của các buổi phỏng vấn cũ có thể nhận nhắc quá hạn** (giới hạn 500/lần chạy, lặp nhiều lần).

**Quyết định: bỏ qua lịch cũ, không nhắc.** Biện pháp (làm trước release kế tiếp, độc lập với wizard): thêm điều kiện cắt mốc vào `listOverdueEvaluationSeats` (chỉ xét lịch tạo/đặt theo luồng mới, ví dụ `cs.created_at >= <thời điểm release Calendar mới>`), không sửa dữ liệu cũ. Phù hợp nguyên tắc "giữ nguyên legacy". Cần một hằng/cấu hình mốc thời gian và test cho cả hai phía của mốc.

## 5. Thứ tự thực hiện (phase)

| Phase | Nội dung | Điều kiện hoàn thành |
|---|---|---|
| P0 | Chặn rủi ro 4.1 (nhắc hàng loạt); rà Stage Library (cờ sub-stage, `stage_type`) | Không còn seat legacy nào bị nhắc; sub-stage flags đã duyệt |
| P1 | DDL: `jobs.flow_version`, `legacy_migrations`, permission `migration.manage`; backfill `flow_version=1` | Migration up/down chạy sạch trên bản sao DB prod |
| P2 | Service dry-run + apply cho Track A (gom signature, `adoptPipelineForLegacyJob`, hired_at) + audit/rollback | Test: job legacy → có pipeline, ứng viên giữ nguyên stage, `hired_at` đúng |
| P3 | Wizard chuyển đổi từng job (chọn pipeline, ghép stage, thông báo Calendar, preview diff, xác nhận) + danh sách theo dõi tiến độ + chặn thao tác ghi trên job legacy kèm thông báo | HR chạy được trên staging với dữ liệu sao chép từ prod |
| P4 | Track B + C (hire type, đánh giá đã nộp, mode, busy days) | Báo cáo dry-run không còn mục chưa phân loại |
| P5 | Rehearsal trên bản sao prod, đo thời gian/lock, ký duyệt số liệu trước/sau | Báo cáo đối chiếu khớp 100% đếm ứng viên theo stage |
| P6 | Cutover: xóa UI/API/logic **ghi** cũ (`/admin/jd`, `/admin/pipelines`, modal lịch cũ). **Giữ** reader/fallback legacy để đọc dữ liệu chưa chuyển | Không còn đường ghi theo logic cũ; test hồi quy xanh |

## 6. Job legacy sau cutover và các quyết định đã chốt

Vì người dùng tự chọn chuyển và dữ liệu legacy được giữ nguyên, **không có cổng "phải về 0"**. Thay bằng:
- Báo cáo (trong Migration Center) số job/lịch còn legacy, để HR biết tiến độ; không chặn release.
- Job `flow_version = 1`: đọc được, **mọi thao tác ghi bị chặn** + thông báo yêu cầu chuyển đổi + nút vào luồng chuyển (kể cả job Closed, tùy chọn).
- Đường ghi cũ bị xóa; chỉ còn luồng chuyển đổi một chiều (legacy → mới). Không đồng bộ ngược.
- Reader/fallback legacy được giữ (các chỗ đánh dấu "TODO: LEGACY CODE", reader criteria/rationale hai định dạng, mapper hire type). Cập nhật comment từ "to be removed" thành "kept to read unmigrated legacy data".

Quyết định đã chốt:
1. Job Closed: không bắt buộc chuyển, nhưng có luồng UI nếu người dùng muốn.
2. Job chưa chuyển: chặn thao tác, thông báo yêu cầu chuyển đổi.
3. `entered_stage_at` đơn cũ: để trống.
4. Không seed `candidate_stage_history`; giữ nguyên dữ liệu legacy.
5. Nhắc quá hạn lịch cũ: bỏ qua.
6. Giữ reader hai định dạng.

Hệ quả cần lưu ý:
- Không backfill gì thêm cho dữ liệu chưa chuyển; chỉ khi người dùng chuyển một job thì mới ghi `pipeline_id`, `pipeline_row_id`, `sla_days`, `schedule`, `hired_at` (qua preview).
- Test cần cover job legacy: đọc OK, ghi bị chặn đúng mã lỗi/thông báo, sau chuyển thì ghi được.

## 7. Việc cần kiểm chứng trên DB

### 7.1 Kết quả đã chạy (DB local `smart_hire`, 2026-10-23, chỉ đọc)

Lưu ý: đây là DB local, chưa phải dữ liệu develop/production; cần chạy lại trên môi trường thật trước khi chốt phạm vi.

| Chỉ số | Kết quả |
|---|---|
| Tổng job (chưa xoá) | 10 |
| Job legacy (`pipeline_id` null) | 5 |
| Job có mapping active trỏ tới stage đã xoá mềm | 0 |
| Job có cùng một stage lặp lại trong mapping active | 0 |
| Pipeline đã xoá mềm nhưng còn job tham chiếu | 0 |
| Job có candidate trỏ vào mapping đã xoá | 0 |
| Số nhóm signature stage (job legacy) | 1 |
| `hire_type` | Full-time 8, Internship 1, null 1 |
| Lịch cũ theo trạng thái | Scheduled 2, NoShow 1, Rescheduled 1 |
| Stage code dùng ở job legacy | chỉ `cv_screening` (1 job) |

Nhận xét:
- 5 job legacy nhưng chỉ 1 job có mapping stage; wizard phải xử lý job legacy chưa có stage nào.
- Mọi số liên quan xoá mềm đều bằng 0: trường hợp "xoá mềm nhưng đang dùng" chưa xảy ra, chỉ xuất hiện sau khi bỏ chặn `IN_USE`.
- Có 1 job `hire_type` null.

### 7.2 Còn lại chưa làm

- Chạy lại các số đếm trên DB develop/production.
- Số seat sẽ bị nhắc quá hạn; thời gian chạy backfill trên dữ liệu thật (lock `campaign_applied`, `candidate_schedules`).
- Caller cũ của decline/withdraw và `activity.ts`/`match-view.ts` (mục 7 của tài liệu đối soát) để biết có logic cũ nào đọc dữ liệu legacy sau cutover.

### 7.3 Danh sách truy vấn (tham chiếu)

- Đếm thêm: số job có `job_stage_mappings` active trỏ tới `pipeline_stages` đã xoá mềm; số job có cùng một stage xuất hiện nhiều lần trong mapping active (pipeline_rows cho phép trùng stage nhưng wizard cần ghép 1-1); số pipeline đã xoá mềm nhưng còn job tham chiếu (`jobs.pipeline_id`).
- Đếm: số job legacy, số nhóm signature stage, số job có mapping đã xóa nhưng còn được trỏ, số giá trị `hire_type` khác nhau, số lịch cũ theo trạng thái, số seat sẽ bị nhắc quá hạn.
- Có job cũ nào dùng stage code ngoài bộ chuẩn không.
- Thời gian chạy backfill trên dữ liệu thật (lock `campaign_applied`, `candidate_schedules`).
- Caller cũ của decline/withdraw và `activity.ts`/`match-view.ts` (mục 7 của tài liệu đối soát) để biết có logic cũ nào đọc dữ liệu legacy sau cutover.
