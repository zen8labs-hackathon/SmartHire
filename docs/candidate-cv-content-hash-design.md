# CV content hash (`cv_content_sha256`)

## Purpose

Detect duplicate uploads of the **same document** when:

- Parsed email/phone differ between runs (LLM variance, formatting), or
- Contact fields are missing on one of the CVs.

## When it is computed

In the Edge Function [`process-cv`](../supabase/functions/process-cv/index.ts), **after** plain text is extracted from PDF/DOCX and **before** the LLM parse. If extraction yields enough text, the function hashes the normalized string and writes `candidates.cv_content_sha256`.

## Normalization (stable fingerprint)

To reduce noise from whitespace and Unicode compatibility forms:

1. `String.prototype.normalize("NFKC")`
2. Collapse all whitespace runs to a single ASCII space
3. `trim()`
4. `toLowerCase()`

Then SHA-256 over UTF-8 bytes; store as 64 lowercase hex characters.

## Matching

The Next.js process route uses [`lib/candidates/duplicate-detection.ts`](../lib/candidates/duplicate-detection.ts): two active candidates match on content when both have the same non-null `cv_content_sha256`.

## Limits

- Re-exporting or re-saving a PDF can change extracted text → different hash.
- Two different people sharing an identical CV template may hash the same (rare).
- Very small or unreadable files may not get a hash (parse fails or short text).

## Schema

Column: `public.candidates.cv_content_sha256` (nullable `text`), partial index on active rows with non-null hash (see migration `20260504120000_candidates_cv_content_sha256.sql`).

---

## CV file hash (`cv_file_sha256`)

SHA-256 of the **raw file bytes** immediately after download in `process-cv`. Same byte stream always yields the same hash, so re-uploading the identical file is detected even when LLM output or PDF text extraction varies.

If hashing throws, the Edge function logs a warning and stores `null` so parsing can still complete.

Schema: `public.candidates.cv_file_sha256` (nullable `text`); partial index in migration `20260505140000_candidates_cv_file_sha256.sql`.
