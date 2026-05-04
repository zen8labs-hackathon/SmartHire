# Kế hoạch: Check trùng CV (cùng người + cùng file)

## Mục tiêu

| Trường hợp | Hành vi mong muốn |
|------------|-------------------|
| **A.** Hai CV **khác nội dung** nhưng **cùng email/phone** (một người) | Báo trùng sau parse, cho phép replace hoặc giữ bản mới. |
| **B.** **Cùng một file** upload hai lần (byte giống) | Báo trùng ổn định, **không phụ thuộc** LLM (ví dụ 2 năm vs 3 năm) hay dao động text extract PDF. |

## Hiện trạng (rút gọn)

- Dedupe chạy sau `POST /api/admin/candidates/[id]/process`, trong [`app/api/admin/candidates/[id]/process/route.ts`](app/api/admin/candidates/[id]/process/route.ts), dùng [`lib/candidates/duplicate-detection.ts`](lib/candidates/duplicate-detection.ts).
- Đã có: email/phone chuẩn hóa + `cv_content_sha256` (hash **text** đã extract).
- Hạn chế: `cv_content_sha256` có thể khác nhau giữa hai lần đọc cùng một PDF; LLM có thể khác nhẹ `parsed_payload` → case **B** dễ lọt.

## Hướng giải quyết

Thêm **`cv_file_sha256`**: SHA-256 của **buffer file gốc** (Uint8Array sau khi tải từ storage trong Edge Function), lưu cột `text` trên `candidates`.

**Thứ tự ưu tiên `matchedOn` khi có nhiều tín hiệu trùng trên một cặp ứng viên:**

1. Email / Phone (`email`, `phone`, `email_or_phone`)
2. `cv_file` (trùng `cv_file_sha256`)
3. `cv_content` (trùng `cv_content_sha256`)

---

## 1. Database migration (file SQL mới)

**Không sửa** các migration cũ; chỉ thêm file mới, ví dụ:

`supabase/migrations/YYYYMMDDHHMMSS_candidates_cv_file_sha256.sql`

Nội dung:

- `alter table public.candidates add column if not exists cv_file_sha256 text;`
- **Partial index**: `(cv_file_sha256) where is_active is true and cv_file_sha256 is not null`
- Mở rộng constraint `candidate_cv_replacements_matched_on_check`: thêm `'cv_file'`  
  (drop constraint cũ → add constraint mới với đủ giá trị: `email`, `phone`, `email_or_phone`, `cv_content`, `cv_file`).

---

## 2. Edge Function `process-cv`

**File:** [`supabase/functions/process-cv/index.ts`](supabase/functions/process-cv/index.ts)

- Refactor nhỏ: hàm dùng chung `sha256ToHex(data: BufferSource)` cho cả text và bytes.
- Ngay sau `const bytes = new Uint8Array(ab)`:
  - Gọi `cvFileSha256Hex(bytes)` — **try/catch** bên trong; nếu lỗi → `console.warn`, trả `null`, **không fail** toàn bộ parse (ổn định vận hành).
- Trong `update` candidate thành công: thêm `cv_file_sha256: <hex | null>`.

**File:** [`supabase/functions/process-cv/README.md`](supabase/functions/process-cv/README.md) — một dòng mô tả `cv_file_sha256`.

---

## 3. Logic chống trùng (shared lib)

**File:** [`lib/candidates/duplicate-detection.ts`](lib/candidates/duplicate-detection.ts)

- `DuplicateMatchedOn`: thêm `"cv_file"`.
- `CandidateDedupeRow`: thêm `cv_file_sha256?: string | null`.
- `shouldFetchCandidatesForDedupe`: true nếu có email **hoặc** phone **hoặc** `cv_content_sha256` **hoặc** `cv_file_sha256`.
- `findDuplicateCandidateHits`:
  - `fileHashMatch` = cả hai bên có `cv_file_sha256` không rỗng và bằng nhau.
  - `contentHashMatch` = tương tự với `cv_content_sha256`.
  - Gọi `matchedOnFromFlags(emailMatch, phoneMatch, fileHashMatch, contentHashMatch)` đúng thứ tự ưu tiên ở trên.

---

## 4. API & UI

| Thành phần | Việc làm |
|------------|----------|
| [`app/api/admin/candidates/[id]/process/route.ts`](app/api/admin/candidates/[id]/process/route.ts) | `select` thêm `cv_file_sha256` (current + others); map trong `candidateRowToDedupe`. |
| [`app/api/admin/candidates/[id]/replace/route.ts`](app/api/admin/candidates/[id]/replace/route.ts) | Cho phép `matchedOn === 'cv_file'` trong type + validation (logic replace giữ như các loại khác). |
| [`components/admin/candidates/add-candidate-modal.tsx`](components/admin/candidates/add-candidate-modal.tsx) | Mở rộng type `matchedOn`; khi `cv_file` → thông báo **`File đã tồn tại`** (hoặc câu confirm tiếng Việt rõ: trùng file đã có trong hệ thống). |
| [`lib/candidates/db-row.ts`](lib/candidates/db-row.ts) | Optional field `cv_file_sha256` trên type row (nếu cần cho UI/API khác). |

---

## 5. Testing

**File:** [`lib/candidates/duplicate-detection.test.ts`](lib/candidates/duplicate-detection.test.ts)

- `shouldFetchCandidatesForDedupe`: chỉ có `cv_file_sha256` → `true`.
- Trùng **chỉ** file hash → `matchedOn === 'cv_file'`.
- Trùng cả file và content, **không** email/phone → `matchedOn === 'cv_file'` (ưu tiên 2 > 3).
- Trùng email + file → `matchedOn === 'email'` (ưu tiên 1).

Chạy: `npm test` (Vitest).

---

## 6. Triển khai & thứ tự

1. Merge/chạy **migration** lên DB (local + production).
2. **Deploy** Edge Function `process-cv` (có ghi `cv_file_sha256`).
3. Deploy **Next.js** (process route + lib + modal).

Nếu thiếu bước 1 mà đã deploy Edge: `update` có thể lỗi nếu cột chưa tồn tại.

---

## 7. Rủi ro / giới hạn

- Hai file **khác byte** (export lại PDF) nhưng cùng người: vẫn dựa email/phone / `cv_content_sha256`.
- Hash file **null** nếu `cvFileSha256Hex` lỗi → chỉ còn các tín hiệu khác.
- Dedupe vẫn là **gợi ý** (confirm), không chặn tạo row tại `sign-upload`.

---

## Checklist nghiệm thu

- [x] Migration + code (xem `20260505140000_candidates_cv_file_sha256.sql` và các file đã cập nhật).
- [ ] Migration chạy OK trên DB thật, constraint `matched_on` chấp nhận `cv_file`.
- [ ] Upload cùng file 2 lần → popup/confirm trùng (tiếng Việt khi `cv_file`).
- [ ] Hai CV khác nội dung, cùng email → vẫn trùng theo email.
- [x] `npm test` pass (Vitest).
