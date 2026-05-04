# Candidate CV duplicate detection

## Overview

Duplicates are detected **after** the Edge Function `process-cv` parses the CV and updates the candidate row. Matching uses (priority: email/phone, then file bytes, then extracted text):

1. **Email** — normalized from `parsed_payload.email` (trim, lowercase, extract embedded address if needed).
2. **Phone** — digit-only plus Vietnam-style variants (`84…` ↔ `0…`, suffix 9–10 digits).
3. **File hash** — SHA-256 of raw uploaded bytes (`cv_file_sha256`), set in `process-cv` right after download. Stable for re-uploading the **same file**.
4. **Content hash** — SHA-256 of normalized plain text (`cv_content_sha256`), set after text extraction. Useful when contact differs but body text matches.

There is **no** duplicate check at `sign-upload` time; hashes are computed in `process-cv` after the file is downloaded from storage.

## Code map

| Step | Location |
|------|----------|
| Sign upload + insert row | [`app/api/admin/candidates/sign-upload/route.ts`](../app/api/admin/candidates/sign-upload/route.ts) |
| Client upload + invoke process | [`components/admin/candidates/add-candidate-modal.tsx`](../components/admin/candidates/add-candidate-modal.tsx) |
| Invoke Edge + JD match + dedupe | [`app/api/admin/candidates/[id]/process/route.ts`](../app/api/admin/candidates/[id]/process/route.ts) |
| Parse CV, persist `parsed_payload` + `cv_file_sha256` + `cv_content_sha256` | [`supabase/functions/process-cv/index.ts`](../supabase/functions/process-cv/index.ts) |
| Dedupe logic (pure) | [`lib/candidates/duplicate-detection.ts`](../lib/candidates/duplicate-detection.ts) |
| User confirms replace | [`app/api/admin/candidates/[id]/replace/route.ts`](../app/api/admin/candidates/[id]/replace/route.ts) |
| Replacement history | Table `candidate_cv_replacements` (see migrations) |

## `matched_on` values

Stored on `candidate_cv_replacements.matched_on`: `email`, `phone`, `email_or_phone`, `cv_file`, `cv_content`.

## Manual QA checklist

Run against a dev/staging project with `process-cv` deployed and LLM keys set.

1. **Email** — Upload CV A with `user@example.com`. Upload new candidate B with the same email (same or different file). After processing, expect duplicate prompt; confirm **Replace** archives A and resets B to New.
2. **Phone VN formats** — A uses `0912345678`, B uses `+84 912 345 678` (same subscriber number). Expect duplicate by phone.
3. **Same file twice** — Upload the same PDF bytes twice; expect duplicate by **`cv_file`** (or confirm in Vietnamese in the modal when `matchedOn` is `cv_file`).
4. **Content only** — Two PDFs with identical body text but different filenames / omitted contact on one; expect duplicate by **cv content** if hashes match.
5. **Cancel** — On duplicate prompt, **Cancel** leaves both active; new row remains a separate candidate.
6. **No false positive** — Two distinct people with different email, phone, and CV text should not appear as duplicates.

Automated coverage for normalization lives in `lib/candidates/duplicate-detection.test.ts` (`npm test`).
