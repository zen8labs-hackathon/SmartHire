# Kế hoạch implement "Candidates 2"

> Mục tiêu: nối prototype mock `app/admin/candidates-2/` vào backend thật, theo mẫu `app/admin/position-management-2/api.ts` (adapter `api.ts` map dữ liệu API → kiểu UI).
> Cấu trúc: **Phase (cấp 1) → Task (cấp 2)**. Task trong mỗi phase được sắp xếp **theo thứ tự cần làm trước → sau** (số thứ tự = thứ tự thực hiện).
> Khi yêu cầu implement một task, hãy đọc các tài liệu ở dòng **Tài liệu** của phase và task đó trước khi code.

## Bảng tra tài liệu nguồn

| Tài liệu | Dùng để | Anchor |
|---|---|---|
| [index](./index.html) | Tổng quan, mục lục | — |
| [01 Functional spec](./01-functional-specification.html) | Needs `BN-xx`, use case `UC-xx-yy`, module `CAN-xx` | `#BN-01..13`, `#CAN-01..12`, `#UC-xx-yy` |
| [02 Business rules](./02-business-rules.html) | Rule `BR-xx-yy` (nguồn chính để code) | `#CAN-xx`, `#BR-xx-yy` |
| [03 Data dictionary](./03-data-dictionary.html) | Thực thể/trường/enum cho migration | `#D-1` Person, `#D-2` Application, `#D-3` CV file, `#D-4` Reminder, `#D-5` Consent, `#D-6` Timeline event |
| [04 Diagrams](./04-diagrams.html) | Sơ đồ luồng/trạng thái mỗi module | `#CAN-xx` |
| [05 Gap log](./05-gap-log.html) | Câu hỏi mở `Q-xx-yy` | `#Q-xx-yy` |
| [06 Traceability](./06-traceability.html) | BN → BR → UC → code | `#CAN-xx`, `#TR-UC-xx-yy` |
| [07 Role & permission](./07-role-permission.html) | Phân quyền theo module | `#CAN-xx` |
| [08 Acceptance criteria](./08-acceptance-criteria.html) | Tiêu chí nghiệm thu `AC-xx-yy` | `#CAN-xx`, `#AC-xx-yy` |

Mỗi module `CAN-xx` có cùng anchor trong 01, 02, 04, 06, 07, 08 — ví dụ CAN-05: [01](./01-functional-specification.html#CAN-05) · [02](./02-business-rules.html#CAN-05) · [04](./04-diagrams.html#CAN-05) · [06](./06-traceability.html#CAN-05) · [07](./07-role-permission.html#CAN-05) · [08](./08-acceptance-criteria.html#CAN-05).

**Quyết định sản phẩm đã chốt:** không Proposal; bỏ Duplicate position; notify tắt (reminder chỉ in-app, [BR-07-06](./02-business-rules.html#BR-07-06)); Talent pool chỉ nằm trong Candidates ([BR-07-10](./02-business-rules.html#BR-07-10)); không ẩn/xoá/retention ([BR-11-01](./02-business-rules.html#BR-11-01)).

## Hiện trạng

- **Prototype (mock):** `app/admin/candidates-2/` — `data.ts`, `cand-list.tsx`, `cand-profile.tsx`, `cand-dialogs.tsx`, `cand-mvp.tsx`, `candidates-app.tsx`, `candidates.css`, `layout.tsx`, `page.tsx`.
- **Menu:** `lib/nav/menu.ts` đã có mục `candidates2` (`/admin/candidates-2`, `show: isHr`).
- **API có sẵn:** `app/api/admin/candidates/` — `route.ts` (list), `[id]/{profile, applications, activity, timeline, cv, cv-download, cv-history, reject, rescore, discard-duplicate, link-to-candidate, other-applications, update-with-history, resolve-profile-conflict}`, `check-duplicate`, `deduped`, `manual`, `temp-upload`, `jd-match/bulk`.
- **Lib có sẵn:** `lib/candidates/` — `candidates-list-query.ts`, `merge-candidate-into.ts`, `merge-duplicate-application.ts`, `duplicate-detection.ts`, `find-duplicate-candidates.ts`, `cv-hash.ts`, `candidate-profile-patch.ts`, `apply-manual-profile-edit.ts`, `cv-management-version-list.ts`, `insert-candidate-cv.ts`, `source-constants.ts`.
- **DB còn thiếu** (grep migrations không thấy): rehire eligibility, tag, reminder/talent pool, consent, lý do kết thúc chuẩn hoá, sự kiện timeline cấp ứng viên.

## Thứ tự phase

```
Phase 0 → 1 → 2 → 3 → 4 → 5 → 6
Phase 5 độc lập sau Phase 2 (có thể song song với 3–4)
Phase 4.6 (Add to position) cần cooldown (3.5) và Talent pool (4.5)
```

---

## Phase 0 — Nền tảng & chốt quyết định

**Tài liệu:** [05 Gap log](./05-gap-log.html) · [03 Data dictionary](./03-data-dictionary.html) · [07 Role & permission](./07-role-permission.html#CAN-12) · [06 Traceability](./06-traceability.html)
**Mục tiêu:** không bị chặn giữa chừng bởi gap tài liệu hoặc thiếu schema.

| # | Task | Nội dung | Tài liệu | Code |
|---|---|---|---|---|
| 0.1 | Đọc docs Next | Đọc `node_modules/next/dist/docs/` trước khi viết route/page | AGENTS.md | — |
| 0.2 | Chốt gap chặn | Q-04-04 (7 vs 8 lý do kết thúc), Q-10-03 (chuẩn hoá + rỗng không khớp), Q-06-02 (gợi ý Not eligible khi noshow), Q-05-03 (Resource Manager thấy cooldown) → ghi quyết định vào gap log | [Q-04-04](./05-gap-log.html#Q-04-04) · [Q-10-03](./05-gap-log.html#Q-10-03) · [Q-06-02](./05-gap-log.html#Q-06-02) · [Q-05-03](./05-gap-log.html#Q-05-03) | [05-gap-log.html](./05-gap-log.html) |
| 0.3 | Migration schema | Rehire eligibility (+ người đặt, ngày, lý do), tag, reminder, consent, end reason (7 giá trị, `other` cần note), timeline event. Migration mới sau `1793100000000_*` | [D-1](./03-data-dictionary.html#D-1) · [D-2](./03-data-dictionary.html#D-2) · [D-4](./03-data-dictionary.html#D-4) · [D-5](./03-data-dictionary.html#D-5) · [D-6](./03-data-dictionary.html#D-6) | `migrations/` |
| 0.4 | Role guard | Layout chỉ cho HR + Admin, vai trò khác redirect `/admin/jd`; kiểm tra quyền ở API route | [BR-12-01](./02-business-rules.html#BR-12-01) · [BR-12-02](./02-business-rules.html#BR-12-02) · [UC-12-01](./01-functional-specification.html#UC-12-01) · [07](./07-role-permission.html#CAN-12) · [AC-12-01](./08-acceptance-criteria.html#AC-12-01) | `app/admin/candidates-2/layout.tsx` |
| 0.5 | Khung adapter | `app/admin/candidates-2/api.ts` (fetch + map API → kiểu UI, id số ↔ uuid); tách type khỏi `data.ts` | [03](./03-data-dictionary.html) | mẫu `position-management-2/api.ts` |

**Done:** gap có quyết định, migration chạy, route bị guard, `api.ts` có khung và typecheck pass.

---

## Phase 1 — Danh sách ứng viên (CAN-01)

**Tài liệu:** [01 · CAN-01](./01-functional-specification.html#CAN-01) · [02 · CAN-01](./02-business-rules.html#CAN-01) · [04](./04-diagrams.html#CAN-01) · [06](./06-traceability.html#CAN-01) · [07](./07-role-permission.html#CAN-01) · [08 · CAN-01](./08-acceptance-criteria.html#CAN-01) · gap [Q-01-01..03](./05-gap-log.html#Q-01-01)

| # | Task | Nội dung | Tài liệu | Code |
|---|---|---|---|---|
| 1.1 | API list | Tìm contains không phân biệt dấu/hoa-thường, phân trang + sort phía server | [UC-01-01](./01-functional-specification.html#UC-01-01) · [BR-01](./02-business-rules.html#CAN-01) · [AC-01-01](./08-acceptance-criteria.html#AC-01-01) | `lib/candidates/candidates-list-query.ts`, `app/api/admin/candidates/route.ts` |
| 1.2 | Map list trong `api.ts` | Hàm map row API → kiểu UI của list | [D-1](./03-data-dictionary.html#D-1) | `candidates-2/api.ts` |
| 1.3 | Nối UI list | Thay mock; loading/empty/error; điểm AI ngưỡng 80/65/50 + review/scoreErr/scoring | [BR-01](./02-business-rules.html#CAN-01) · [AC-01-02](./08-acceptance-criteria.html#AC-01-02) | `cand-list.tsx`, `candidates-app.tsx` |
| 1.4 | Lọc & tab | Bộ lọc, tab All / Talent pool (dữ liệu pool điền ở Phase 4) | [UC-01-02](./01-functional-specification.html#UC-01-02) · [AC-01-03](./08-acceptance-criteria.html#AC-01-03) | `candidates-app.tsx` |
| 1.5 | Khung thanh bulk | Chọn nhiều + thanh thao tác (action thật nối ở Phase 4/5) | [UC-01-03](./01-functional-specification.html#UC-01-03) · [AC-01-04](./08-acceptance-criteria.html#AC-01-04) | `cand-list.tsx` |

**Done:** danh sách thật, tìm kiếm có dấu/không dấu đúng, phân trang server.

---

## Phase 2 — Hồ sơ & CV (CAN-02, CAN-03)

**Tài liệu:** CAN-02 [01](./01-functional-specification.html#CAN-02) · [02](./02-business-rules.html#CAN-02) · [04](./04-diagrams.html#CAN-02) · [08](./08-acceptance-criteria.html#CAN-02) — CAN-03 [01](./01-functional-specification.html#CAN-03) · [02](./02-business-rules.html#CAN-03) · [04](./04-diagrams.html#CAN-03) · [08](./08-acceptance-criteria.html#CAN-03) · gap [Q-02-01..03](./05-gap-log.html#Q-02-01), [Q-03-01..02](./05-gap-log.html#Q-03-01) · data [D-1](./03-data-dictionary.html#D-1), [D-3](./03-data-dictionary.html#D-3)

| # | Task | Nội dung | Tài liệu | Code |
|---|---|---|---|---|
| 2.1 | Đọc hồ sơ | Nối header + tổng quan hồ sơ | [UC-02-01](./01-functional-specification.html#UC-02-01) · [AC-02-01](./08-acceptance-criteria.html#AC-02-01) | `[id]/profile`, `cand-profile.tsx` |
| 2.2 | Xem phiên bản CV | Danh sách/xem/tải CV | [UC-03-01](./01-functional-specification.html#UC-03-01) · [AC-03-01](./08-acceptance-criteria.html#AC-03-01) | `[id]/cv`, `cv-download`, `cv-history`, `cv-management-version-list.ts` |
| 2.3 | Sửa liên hệ | Sửa thông tin liên hệ có lịch sử | [UC-02-02](./01-functional-specification.html#UC-02-02) · [AC-02-02](./08-acceptance-criteria.html#AC-02-02) | `update-with-history`, `candidate-profile-patch.ts` |
| 2.4 | Upload CV mới | PDF/DOCX ≤ 10 MB; gắn application đang mở hoặc pool; nguồn CV thống nhất | [UC-03-02](./01-functional-specification.html#UC-03-02) · [BR-03](./02-business-rules.html#CAN-03) · [AC-03-02](./08-acceptance-criteria.html#AC-03-02) | `temp-upload`, `insert-candidate-cv.ts`, `source-constants.ts`, `cv-hash.ts` |
| 2.5 | Xung đột CV mới vs giá trị HR đã sửa | Dialog giải quyết xung đột | [UC-02-03](./01-functional-specification.html#UC-02-03) · [AC-02-03](./08-acceptance-criteria.html#AC-02-03) | `resolve-profile-conflict` |
| 2.6 | Sửa kinh nghiệm / hoàn về giá trị AI | Revert về giá trị AI | [UC-02-04](./01-functional-specification.html#UC-02-04) · [AC-02-04](./08-acceptance-criteria.html#AC-02-04) | `apply-manual-profile-edit.ts` |
| 2.7 | So sánh phiên bản CV | Diff 2 phiên bản | [UC-03-03](./01-functional-specification.html#UC-03-03) · [AC-03-03](./08-acceptance-criteria.html#AC-03-03) | `cv-history` |
| 2.8 | Chấm lại điểm AI | Dùng dịch vụ AI hiện có | [BR-08-08](./02-business-rules.html#BR-08-08) | `[id]/rescore` |
| 2.9 | Xuất hồ sơ | PDF, không kèm ghi chú nội bộ | [UC-02-05](./01-functional-specification.html#UC-02-05) | — (cần chốt cách render PDF) |

**Done:** mở hồ sơ thật, sửa/tải CV, điểm cập nhật.

---

## Phase 3 — Application, lịch sử, cooldown, rehire (CAN-04, 05, 06)

**Tài liệu:** CAN-04 [01](./01-functional-specification.html#CAN-04) · [02](./02-business-rules.html#CAN-04) · [04](./04-diagrams.html#CAN-04) · [08](./08-acceptance-criteria.html#CAN-04) — CAN-05 [01](./01-functional-specification.html#CAN-05) · [02](./02-business-rules.html#CAN-05) · [04](./04-diagrams.html#CAN-05) · [08](./08-acceptance-criteria.html#CAN-05) — CAN-06 [01](./01-functional-specification.html#CAN-06) · [02](./02-business-rules.html#CAN-06) · [04](./04-diagrams.html#CAN-06) · [08](./08-acceptance-criteria.html#CAN-06) · gap [Q-04-01..04](./05-gap-log.html#Q-04-01), [Q-05-01..03](./05-gap-log.html#Q-05-01), [Q-06-01..02](./05-gap-log.html#Q-06-01) · data [D-2](./03-data-dictionary.html#D-2), [D-6](./03-data-dictionary.html#D-6)

| # | Task | Nội dung | Tài liệu | Code |
|---|---|---|---|---|
| 3.1 | Applications tab | Danh sách application + kết quả (open/ended/pool/official/probation/hired) | [UC-04-01](./01-functional-specification.html#UC-04-01) · [AC-04-01](./08-acceptance-criteria.html#AC-04-01) | `[id]/applications`, `other-applications` |
| 3.2 | Lý do kết thúc | 7 lý do cố định, `other` bắt buộc note (cần Q-04-04 từ 0.2) | [UC-04-02](./01-functional-specification.html#UC-04-02) · [BR-04](./02-business-rules.html#CAN-04) · [AC-04-02](./08-acceptance-criteria.html#AC-04-02) | `[id]/reject` |
| 3.3 | Timeline events | Ghi/đọc sự kiện cấp ứng viên; Record reason; trạng thái rỗng | [D-6](./03-data-dictionary.html#D-6) · [BR-05-02](./02-business-rules.html#BR-05-02) · [BR-05-05](./02-business-rules.html#BR-05-05) · [BR-05-09](./02-business-rules.html#BR-05-09) | `[id]/timeline`, `[id]/activity` |
| 3.4 | History tab & lọc | Mới nhất trước; lọc vị trí + loại; nhóm theo năm | [UC-05-02](./01-functional-specification.html#UC-05-02) · [BR-05-03](./02-business-rules.html#BR-05-03) · [AC-05-02](./08-acceptance-criteria.html#AC-05-02) | `cand-profile.tsx` |
| 3.5 | HistoryStrip | 4 ô: tổng, đang mở, kết thúc gần nhất, rehire | [UC-05-01](./01-functional-specification.html#UC-05-01) · [BR-05-01](./02-business-rules.html#BR-05-01) · [AC-05-01](./08-acceptance-criteria.html#AC-05-01) | `cand-profile.tsx` |
| 3.6 | Cooldown | 6 × 30,44 ngày từ ngày kết thúc gần nhất; chỉ cảnh báo, không chặn, không hạ điểm; hiện khi có application mở | [UC-05-03](./01-functional-specification.html#UC-05-03) · [BR-05-06..08](./02-business-rules.html#BR-05-06) · [AC-05-03](./08-acceptance-criteria.html#AC-05-03) | `data.ts · COOLDOWN` → hàm server/shared |
| 3.7 | Rehire | API + dialog 3 giá trị; Not eligible bắt buộc lý do; ghi timeline "Rehire set to: …"; "Set by … · ngày"/"Not set"; không chặn thêm vào vị trí | [UC-06-01](./01-functional-specification.html#UC-06-01) · [BR-06-01..06](./02-business-rules.html#BR-06-01) · [AC-06-01..03](./08-acceptance-criteria.html#AC-06-01) | `cand-dialogs.tsx · RehireDialog`, route mới |

**Done:** timeline/cooldown/rehire chạy thật và ghi sự kiện đúng.

---

## Phase 4 — Consent, tag, reminder, Talent pool, thêm vào vị trí (CAN-08, 07, 09)

**Tài liệu:** CAN-08 [01](./01-functional-specification.html#CAN-08) · [02](./02-business-rules.html#CAN-08) · [08](./08-acceptance-criteria.html#CAN-08) — CAN-07 [01](./01-functional-specification.html#CAN-07) · [02](./02-business-rules.html#CAN-07) · [04](./04-diagrams.html#CAN-07) · [08](./08-acceptance-criteria.html#CAN-07) — CAN-09 [01](./01-functional-specification.html#CAN-09) · [02](./02-business-rules.html#CAN-09) · [04](./04-diagrams.html#CAN-09) · [08](./08-acceptance-criteria.html#CAN-09) · gap [Q-07-01..02](./05-gap-log.html#Q-07-01), [Q-08-01..02](./05-gap-log.html#Q-08-01), [Q-09-01](./05-gap-log.html#Q-09-01), [Q-INT-03](./05-gap-log.html#Q-INT-03) · data [D-4](./03-data-dictionary.html#D-4), [D-5](./03-data-dictionary.html#D-5)

| # | Task | Nội dung | Tài liệu | Code |
|---|---|---|---|---|
| 4.1 | Consent card (chỉ đọc) | Ngày + kênh, không hết hạn; ứng viên mới = ngày tạo | [UC-08-01](./01-functional-specification.html#UC-08-01) · [BR-08-01/02/08](./02-business-rules.html#BR-08-01) · [AC-08-01](./08-acceptance-criteria.html#AC-08-01) | `cand-mvp.tsx · ConsentCard` |
| 4.2 | Tag | Enter thêm, "×" xoá, không trùng; bulk bỏ qua người đã có | [UC-07-01](./01-functional-specification.html#UC-07-01) · [BR-07-01/03](./02-business-rules.html#BR-07-01) · [AC-07-01](./08-acceptance-criteria.html#AC-07-01) | `cand-mvp.tsx · TagEditor`, `BulkTagDialog` |
| 4.3 | Reminder | Preset 1/3/6 tháng (mặc định +3); ngày bắt buộc; badge Due; bulk; không gửi notification | [UC-07-02](./01-functional-specification.html#UC-07-02) · [BR-07-04..07/09](./02-business-rules.html#BR-07-04) · [AC-07-02](./08-acceptance-criteria.html#AC-07-02) | `ReminderDialog` |
| 4.4 | Mark contacted | Ghi Re-contacted vào timeline và xoá reminder | [UC-07-03](./01-functional-specification.html#UC-07-03) · [BR-07-08](./02-business-rules.html#BR-07-08) · [AC-07-03](./08-acceptance-criteria.html#AC-07-03) | timeline (3.3) |
| 4.5 | Talent pool | Thêm/gỡ pool; tab Talent pool là bề mặt duy nhất; PM chuyển hướng về đây | [UC-07-04](./01-functional-specification.html#UC-07-04) · [BR-07-10](./02-business-rules.html#BR-07-10) · [AC-07-04](./08-acceptance-criteria.html#AC-07-04) · [AC-07-05](./08-acceptance-criteria.html#AC-07-05) | tab pool (1.4) |
| 4.6 | Add to position | Chỉ vị trí mở; 2 điểm vào (hồ sơ, bulk); "Already applying" không chọn được; bulk bỏ qua + "N already applying · skipped"; dùng lại/tải CV; stage "New - Waiting for screening"; chấm lại khi từ pool sang vị trí; không đụng application hiện có | [UC-09-01](./01-functional-specification.html#UC-09-01) · [BR-09-01..06](./02-business-rules.html#BR-09-01) · [AC-09-01..04](./08-acceptance-criteria.html#AC-09-01) | `AddToPositionDialog`, tái dùng `insert-candidate-cv.ts` |

**Done:** consent/tag/reminder/pool hoạt động; thêm vào vị trí tạo đúng application.

---

## Phase 5 — Trùng lặp, Merge, không xoá (CAN-10, 11)

**Tài liệu:** CAN-10 [01](./01-functional-specification.html#CAN-10) · [02](./02-business-rules.html#CAN-10) · [04](./04-diagrams.html#CAN-10) · [08](./08-acceptance-criteria.html#CAN-10) — CAN-11 [01](./01-functional-specification.html#CAN-11) · [02](./02-business-rules.html#CAN-11) · [08](./08-acceptance-criteria.html#CAN-11) · gap [Q-10-01..03](./05-gap-log.html#Q-10-01), [Q-11-01](./05-gap-log.html#Q-11-01)

| # | Task | Nội dung | Tài liệu | Code |
|---|---|---|---|---|
| 5.1 | Phát hiện trùng | Email (lowercase) hoặc SĐT (chỉ chữ số) khớp chính xác; rỗng không khớp | [UC-10-01](./01-functional-specification.html#UC-10-01) · [BR-10-01](./02-business-rules.html#BR-10-01) · [AC-10-01](./08-acceptance-criteria.html#AC-10-01) | `duplicate-detection.ts`, `find-duplicate-candidates.ts`, `check-duplicate`, `deduped` |
| 5.2 | Not the same person | Xoá cờ trùng của cặp | [UC-10-03](./01-functional-specification.html#UC-10-03) · [BR-10-06](./02-business-rules.html#BR-10-06) · [AC-10-04](./08-acceptance-criteria.html#AC-10-04) | `discard-duplicate` |
| 5.3 | Merge dialog | So sánh 7 trường, radio, mặc định chọn bản mới hơn | [UC-10-02](./01-functional-specification.html#UC-10-02) · [BR-10-02/03](./02-business-rules.html#BR-10-02) · [AC-10-02](./08-acceptance-criteria.html#AC-10-02) | `cand-dialogs.tsx · MergeDialog` |
| 5.4 | Merge thực thi | Chuyển application, lịch phỏng vấn, 2 phiên bản CV; popup theo Calendar BR-INT-12; vĩnh viễn | [BR-10-04](./02-business-rules.html#BR-10-04) · [Q-10-02](./05-gap-log.html#Q-10-02) · [AC-10-03](./08-acceptance-criteria.html#AC-10-03) · [AC-10-05](./08-acceptance-criteria.html#AC-10-05) | `merge-candidate-into.ts`, `merge-duplicate-application.ts`, `link-to-candidate` |
| 5.5 | Không xoá/ẩn danh | DeleteDialog giữ đúng quyết định (không hide/delete/retention) | [UC-11-01](./01-functional-specification.html#UC-11-01) · [BR-11-01](./02-business-rules.html#BR-11-01) · [AC-11-01](./08-acceptance-criteria.html#AC-11-01) | `DeleteDialog` |

**Done:** merge chuyển đủ dữ liệu, không mất lịch sử; không có đường xoá.

---

## Phase 6 — QA, dọn dẹp, rollout

**Tài liệu:** [08 Acceptance criteria](./08-acceptance-criteria.html) · [06 Traceability](./06-traceability.html) · [07 Role & permission](./07-role-permission.html)

| # | Task | Nội dung | Tài liệu |
|---|---|---|---|
| 6.1 | Test theo AC | Unit test list query, cooldown, chuẩn hoá trùng, merge; chạy từng `AC-xx-yy` | [08](./08-acceptance-criteria.html) |
| 6.2 | Phân quyền | Thử mọi vai trò: HR/Admin vào được, còn lại redirect | [07](./07-role-permission.html) · [AC-12-01](./08-acceptance-criteria.html#AC-12-01) · [AC-12-02](./08-acceptance-criteria.html#AC-12-02) |
| 6.3 | Rà traceability | Mỗi BN/BR/UC có code + test | [06](./06-traceability.html) |
| 6.4 | Dọn mock | Xoá dữ liệu mock/persona trong `data.ts`, giữ type | — |
| 6.5 | Rollout | Typecheck/lint/test, kiểm tra trình duyệt luồng chính, chạy migration, thay mục menu `candidates2` | — |

---

## Rủi ro

- Q-04-04 chưa chốt → ảnh hưởng enum lý do kết thúc và đồng bộ với Position Management.
- Merge không hoàn tác → test kỹ trên dữ liệu có application mở và lịch phỏng vấn.
- Worktree còn nhiều thay đổi dở (position-management-2, calendar-2) → tách commit trước khi bắt đầu.
- Xuất hồ sơ PDF (2.9) chưa có hạ tầng sẵn → cần chốt cách render trước khi làm.
