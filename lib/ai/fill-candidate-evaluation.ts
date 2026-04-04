import "@/lib/ai/pdf-node-polyfill";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import type { PDFFont, PDFPage } from "pdf-lib";
import { PDFDocument, PDFDropdown, PDFTextField, rgb } from "pdf-lib";
import {
  type EvaluationSection,
  MAX_EVAL_SECTION_CHARS,
  fallbackStructuredEvaluation,
  structuredEvaluationSchema,
  structuredEvaluationToDocumentSections,
} from "@/lib/evaluation/evaluation-section-template";
import { tryEmbedNotoSans } from "@/lib/evaluation/noto-fonts-for-pdf";
import { z } from "zod";

const UNICODE_FONT_ERROR =
  "Không thể tải font Noto Sans để hiển thị tiếng Việt trong PDF. Đặt NotoSans-Regular.ttf và NotoSans-Bold.ttf trong thư mục assets/fonts/ hoặc đảm bảo server có thể tải font (CDN).";

export type { EvaluationSection };

function getGateway() {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey?.trim()) throw new Error("AI_GATEWAY_API_KEY is not configured.");
  return createOpenAI({
    apiKey,
    baseURL: "https://ai-gateway.vercel.sh/v1",
  });
}

const LANGUAGE_RULE = `LANGUAGE (critical): Write every generated string in the SAME language as the "Reviewer free-form notes" section. If the notes are Vietnamese, the entire output must be Vietnamese. If English, use English. Do not translate the reviewer’s content into another language.`;

const aiMappingSchema = z.object({
  entries: z
    .array(
      z.object({
        key: z.string().describe("Exact form field name from the template PDF"),
        text: z
          .string()
          .describe("Evaluator text for that field; same language as reviewer notes"),
      }),
    )
    .describe("One entry per listed form field when fields exist"),
});

export type FillEvaluationAiResult = {
  fieldMap: Record<string, string>;
  documentSections: EvaluationSection[];
};

/**
 * Ask the model to map reviewer notes onto AcroForm fields or the fixed 7-part evaluation outline.
 */
export async function buildEvaluationFillPayload(params: {
  formFieldNames: string[];
  templateTextSample: string;
  candidateSummary: string;
  reviewerNotes: string;
}): Promise<FillEvaluationAiResult> {
  const key = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!key) {
    if (params.formFieldNames.length > 0) {
      const fieldMap: Record<string, string> = {};
      const fallback =
        params.reviewerNotes.trim().slice(0, MAX_EVAL_SECTION_CHARS) || "—";
      for (const name of params.formFieldNames) {
        fieldMap[name] = fallback;
      }
      return { fieldMap, documentSections: [] };
    }
    const fb = fallbackStructuredEvaluation(
      params.candidateSummary,
      params.reviewerNotes,
    );
    return {
      fieldMap: {},
      documentSections: structuredEvaluationToDocumentSections(fb),
    };
  }

  const gateway = getGateway();
  const fieldList =
    params.formFieldNames.length > 0
      ? params.formFieldNames.map((n) => `- ${n}`).join("\n")
      : "(no fillable form fields detected)";

  try {
    if (params.formFieldNames.length > 0) {
      const prompt = `You are completing an interview evaluation PDF for a hiring team.

${LANGUAGE_RULE}

## Candidate summary
${params.candidateSummary}

## Reviewer free-form notes (source of truth — do not invent facts)
${params.reviewerNotes}

## Plain text extracted from the evaluation template (context only)
${params.templateTextSample.slice(0, 8000)}${params.templateTextSample.length > 8000 ? "\n…[truncated]" : ""}

## PDF AcroForm field names — return one entry per name, exact "key"
${fieldList}

Map interview insights into the appropriate fields. Use "N/A" or "—" where not applicable. Max ${MAX_EVAL_SECTION_CHARS} characters per value.`;

      const { output } = await generateText({
        model: gateway("openai/gpt-4o-mini"),
        output: Output.object({
          name: "evaluation_form_fill",
          schema: aiMappingSchema,
        }),
        system: `${LANGUAGE_RULE} You output only structured JSON; keys must match PDF field names exactly.`,
        prompt,
        temperature: 0.2,
        maxOutputTokens: 4096,
      });

      const fieldMap: Record<string, string> = {};
      const allowed = new Set(params.formFieldNames);
      for (const e of output.entries) {
        if (!allowed.has(e.key)) continue;
        fieldMap[e.key] = e.text.slice(0, MAX_EVAL_SECTION_CHARS);
      }
      for (const name of params.formFieldNames) {
        if (fieldMap[name] == null || fieldMap[name] === "") {
          fieldMap[name] =
            params.reviewerNotes.trim().slice(0, MAX_EVAL_SECTION_CHARS) || "—";
        }
      }
      return { fieldMap, documentSections: [] };
    }

    const prompt = `You are drafting a structured interview evaluation document.

${LANGUAGE_RULE}

## Candidate summary (use for section 1 where relevant)
${params.candidateSummary}

## Reviewer free-form notes (primary source — expand clearly, no fabricated facts)
${params.reviewerNotes}

## Template PDF plain text (context only; your output structure is fixed below)
${params.templateTextSample.slice(0, 8000)}${params.templateTextSample.length > 8000 ? "\n…[truncated]" : ""}

## Required output shape (field names are fixed)
Fill these keys:
- thongTinUngVien — "1. Thông Tin Ứng Viên": role, background, logistics; use line breaks between facts (no table).
- tomTatDanhGia — "2. Tóm Tắt Đánh Giá": short overall summary of the interview.
- diemManh — "3. Điểm Mạnh".
- diemCanLuuY — "4. Điểm Cần Lưu Ý".
- danhGiaNangLuc — "5. Đánh Giá Năng Lực" (technical/soft skills as implied by notes).

Optional (omit the key or use empty string if not applicable):
- duAnNoiBat — "6. Dự Án Nổi Bật" only if projects are discussed.
- ketLuanKhuyenNghi — "7. Kết Luận & Khuyến Nghị" only if a conclusion or hire recommendation is appropriate.

Max ${MAX_EVAL_SECTION_CHARS} characters per string.`;

    const { output } = await generateText({
      model: gateway("openai/gpt-4o-mini"),
      output: Output.object({
        name: "structured_evaluation",
        schema: structuredEvaluationSchema,
      }),
      system: `${LANGUAGE_RULE} You output only JSON matching the schema. Section semantics follow the Vietnamese outline described in the prompt.`,
      prompt,
      temperature: 0.2,
      maxOutputTokens: 4096,
    });

    const parsed = structuredEvaluationSchema.safeParse(output);
    if (!parsed.success) {
      const fb = fallbackStructuredEvaluation(
        params.candidateSummary,
        params.reviewerNotes,
      );
      return {
        fieldMap: {},
        documentSections: structuredEvaluationToDocumentSections(fb),
      };
    }

    return {
      fieldMap: {},
      documentSections: structuredEvaluationToDocumentSections(parsed.data),
    };
  } catch {
    if (params.formFieldNames.length > 0) {
      const fieldMap: Record<string, string> = {};
      const fallback =
        params.reviewerNotes.trim().slice(0, MAX_EVAL_SECTION_CHARS) || "—";
      for (const name of params.formFieldNames) {
        fieldMap[name] = fallback;
      }
      return { fieldMap, documentSections: [] };
    }
    const fb = fallbackStructuredEvaluation(
      params.candidateSummary,
      params.reviewerNotes,
    );
    return {
      fieldMap: {},
      documentSections: structuredEvaluationToDocumentSections(fb),
    };
  }
}

const PAGE_SIZE: [number, number] = [612, 792];
const MARGIN = 48;
const LINE_H = 13;

function normalizeUnicodePdfText(s: string): string {
  return s.replace(/\0/g, "").normalize("NFC");
}

function wrapLines(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= maxW) line = next;
    else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Wrap each line separated by \\n, then word-wrap within max width (no table layout). */
function wrapParagraphPreservingNewlines(
  text: string,
  font: PDFFont,
  size: number,
  maxW: number,
): string[] {
  const parts = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i].trim();
    if (segment.length === 0) {
      if (out.length > 0) out.push("");
      continue;
    }
    if (out.length > 0) out.push("");
    out.push(...wrapLines(segment, font, size, maxW));
  }
  return out;
}

/**
 * Standalone evaluation PDF with fixed section headings (Noto Sans — preserves Vietnamese).
 */
async function renderStandaloneEvaluationPdf(params: {
  candidateName: string;
  sections: EvaluationSection[];
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const noto = await tryEmbedNotoSans(doc);
  if (!noto) {
    throw new Error(UNICODE_FONT_ERROR);
  }
  const font = noto.regular;
  const bold = noto.bold;
  const clean = (s: string) => normalizeUnicodePdfText(s);

  const [pageW, pageH] = PAGE_SIZE;
  const maxW = pageW - 2 * MARGIN;

  let page: PDFPage = doc.addPage(PAGE_SIZE);
  let y = pageH - MARGIN;

  const needPage = (minLines: number) => {
    if (y < MARGIN + minLines * LINE_H) {
      page = doc.addPage(PAGE_SIZE);
      y = pageH - MARGIN;
    }
  };

  const drawLine = (ln: string, size: number, f: PDFFont, color: ReturnType<typeof rgb>) => {
    needPage(1);
    page.drawText(ln, { x: MARGIN, y, size, font: f, color });
    y -= LINE_H;
  };

  const drawBlock = (lines: string[], size: number, f: PDFFont, color: ReturnType<typeof rgb>) => {
    for (const ln of lines) drawLine(ln, size, f, color);
  };

  const titleMain = clean("Đánh giá phỏng vấn");
  const candLine = clean(`Ứng viên: ${params.candidateName}`);
  const genDate = new Date().toLocaleDateString("vi-VN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const dateLine = clean(`Ngày tạo: ${genDate}`);

  drawBlock(wrapLines(titleMain, bold, 16, maxW), 16, bold, rgb(0.07, 0.12, 0.18));
  y -= 4;
  drawBlock(wrapLines(candLine, font, 11, maxW), 11, font, rgb(0.22, 0.22, 0.26));
  drawBlock(wrapLines(dateLine, font, 9, maxW), 9, font, rgb(0.45, 0.45, 0.5));
  y -= 12;
  y -= 10;

  const BODY_COLOR = rgb(0.25, 0.25, 0.28);

  for (const block of params.sections) {
    y -= 6;
    needPage(3);
    drawBlock(
      wrapLines(clean(block.title), bold, 12, maxW),
      12,
      bold,
      rgb(0.12, 0.14, 0.2),
    );
    y -= 4;

    const bodyLines = wrapParagraphPreservingNewlines(clean(block.body), font, 10, maxW);
    for (const ln of bodyLines) {
      if (ln === "") {
        needPage(1);
        y -= LINE_H * 0.75;
        continue;
      }
      drawLine(ln, 10, font, BODY_COLOR);
    }
    y -= 8;
  }

  return doc.save({ updateFieldAppearances: false });
}

export async function renderFilledEvaluationPdf(params: {
  templatePdfBytes: Uint8Array;
  fill: FillEvaluationAiResult;
  candidateName: string;
  templateHasAcroFormFields: boolean;
}): Promise<Uint8Array> {
  const fieldMap = Object.fromEntries(
    Object.entries(params.fill.fieldMap).map(([k, v]) => [
      k,
      normalizeUnicodePdfText(v),
    ]),
  );

  if (params.templateHasAcroFormFields) {
    const pdfDoc = await PDFDocument.load(params.templatePdfBytes, {
      ignoreEncryption: true,
    });
    const noto = await tryEmbedNotoSans(pdfDoc);
    if (!noto) {
      throw new Error(UNICODE_FONT_ERROR);
    }
    const form = pdfDoc.getForm();
    const fields = form.getFields();

    for (const field of fields) {
      const name = field.getName();
      const value = fieldMap[name];
      if (value == null) continue;
      try {
        if (field instanceof PDFTextField) {
          field.setText(value);
        } else if (field instanceof PDFDropdown) {
          const options = field.getOptions();
          const pick =
            options.find((o) => o.toLowerCase() === value.toLowerCase()) ??
            options[0];
          if (pick) field.select(pick);
        }
      } catch {
        // skip fields that cannot accept the value
      }
    }

    form.updateFieldAppearances(noto.regular);

    if (fields.length > 0) {
      try {
        form.flatten({ updateFieldAppearances: false });
      } catch {
        // some PDFs fail flatten; still save
      }
    }

    return pdfDoc.save({ updateFieldAppearances: false });
  }

  return renderStandaloneEvaluationPdf({
    candidateName: params.candidateName,
    sections: params.fill.documentSections,
  });
}

export async function listPdfFormFieldNames(
  templatePdfBytes: Uint8Array,
): Promise<string[]> {
  try {
    const doc = await PDFDocument.load(templatePdfBytes, { ignoreEncryption: true });
    return doc.getForm().getFields().map((f) => f.getName());
  } catch {
    return [];
  }
}
