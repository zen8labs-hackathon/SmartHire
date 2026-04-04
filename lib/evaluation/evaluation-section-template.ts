import { z } from "zod";

/** Max characters per section body (AI + PDF). */
export const MAX_EVAL_SECTION_CHARS = 4000;

/**
 * Smart Hire evaluation outline. Sections 6–7 are optional: omit from PDF when empty.
 */
export const structuredEvaluationSchema = z.object({
  thongTinUngVien: z
    .string()
    .max(MAX_EVAL_SECTION_CHARS)
    .describe(
      "Section 1 — concise candidate profile from summary + notes only; same language as reviewer notes",
    ),
  tomTatDanhGia: z
    .string()
    .max(MAX_EVAL_SECTION_CHARS)
    .describe("Section 2 — executive summary of the interview; same language as notes"),
  diemManh: z
    .string()
    .max(MAX_EVAL_SECTION_CHARS)
    .describe("Section 3 — strengths; same language as notes"),
  diemCanLuuY: z
    .string()
    .max(MAX_EVAL_SECTION_CHARS)
    .describe("Section 4 — concerns / watch-outs; same language as notes"),
  danhGiaNangLuc: z
    .string()
    .max(MAX_EVAL_SECTION_CHARS)
    .describe("Section 5 — competency assessment; same language as notes"),
  duAnNoiBat: z
    .string()
    .max(MAX_EVAL_SECTION_CHARS)
    .nullish()
    .describe(
      "Section 6 (optional) — notable projects only if mentioned in notes; omit if not applicable",
    ),
  ketLuanKhuyenNghi: z
    .string()
    .max(MAX_EVAL_SECTION_CHARS)
    .nullish()
    .describe(
      "Section 7 (optional) — conclusion & recommendation; omit if not applicable",
    ),
});

export type StructuredEvaluation = z.infer<typeof structuredEvaluationSchema>;

export type EvaluationSection = { title: string; body: string };

const SPECS = [
  { key: "thongTinUngVien" as const, title: "1. Candidate information", optional: false },
  { key: "tomTatDanhGia" as const, title: "2. Assessment summary", optional: false },
  { key: "diemManh" as const, title: "3. Strengths", optional: false },
  { key: "diemCanLuuY" as const, title: "4. Areas to watch", optional: false },
  { key: "danhGiaNangLuc" as const, title: "5. Competency assessment", optional: false },
  { key: "duAnNoiBat" as const, title: "6. Notable projects", optional: true },
  {
    key: "ketLuanKhuyenNghi" as const,
    title: "7. Conclusion & recommendation",
    optional: true,
  },
] as const;

export function structuredEvaluationToDocumentSections(
  s: StructuredEvaluation,
): EvaluationSection[] {
  const out: EvaluationSection[] = [];
  for (const spec of SPECS) {
    const raw = s[spec.key];
    const body =
      typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
    if (spec.optional && body.length === 0) continue;
    out.push({ title: spec.title, body: body.length > 0 ? body : "—" });
  }
  return out;
}

/** When AI is unavailable: required sections only, minimal placeholders. */
export function fallbackStructuredEvaluation(
  candidateSummary: string,
  reviewerNotes: string,
): StructuredEvaluation {
  const notes = reviewerNotes.trim() || "—";
  const sum = candidateSummary.trim() || "—";
  return {
    thongTinUngVien: sum.slice(0, MAX_EVAL_SECTION_CHARS),
    tomTatDanhGia: notes.slice(0, MAX_EVAL_SECTION_CHARS),
    diemManh: "—",
    diemCanLuuY: "—",
    danhGiaNangLuc: "—",
  };
}
