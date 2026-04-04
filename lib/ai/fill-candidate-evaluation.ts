import "@/lib/ai/pdf-node-polyfill";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import {
  PDFDocument,
  PDFDropdown,
  PDFTextField,
  StandardFonts,
  rgb,
} from "pdf-lib";
import { sanitizeForPdfStandardFont } from "@/lib/evaluation/pdf-standard-font-text";
import { z } from "zod";

function getGateway() {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey?.trim()) throw new Error("AI_GATEWAY_API_KEY is not configured.");
  return createOpenAI({
    apiKey,
    baseURL: "https://ai-gateway.vercel.sh/v1",
  });
}

const aiMappingSchema = z.object({
  entries: z
    .array(
      z.object({
        key: z.string().describe("Exact form field name from the template PDF"),
        text: z
          .string()
          .describe("Evaluator text to place in that field; concise, professional"),
      }),
    )
    .describe("One entry per listed form field when fields exist"),
});

const aiSectionSchema = z.object({
  sections: z
    .array(
      z.object({
        title: z.string(),
        body: z.string(),
      }),
    )
    .describe(
      "Structured evaluation sections derived from the template headings and reviewer notes",
    ),
});

const MAX_FIELD_CHARS = 4000;

export type FillEvaluationAiResult = {
  /** Values applied to AcroForm fields (by exact field name) */
  fieldMap: Record<string, string>;
  /** When no form fields, sections appended on a new page */
  appendixSections: { title: string; body: string }[];
};

/**
 * Ask the model to map reviewer notes onto template form field names and/or sections.
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
      const fallback = params.reviewerNotes.trim().slice(0, MAX_FIELD_CHARS) || "—";
      for (const name of params.formFieldNames) {
        fieldMap[name] = fallback;
      }
      return { fieldMap, appendixSections: [] };
    }
    return {
      fieldMap: {},
      appendixSections: [
        {
          title: "Evaluator notes",
          body: params.reviewerNotes.trim() || "—",
        },
      ],
    };
  }

  const gateway = getGateway();
  const fieldList =
    params.formFieldNames.length > 0
      ? params.formFieldNames.map((n) => `- ${n}`).join("\n")
      : "(no fillable form fields detected)";

  const prompt = `You are completing an interview evaluation PDF for a hiring team.

## Candidate summary
${params.candidateSummary}

## Reviewer free-form notes (source of truth)
${params.reviewerNotes}

## Plain text extracted from the evaluation template (for context)
${params.templateTextSample.slice(0, 8000)}${params.templateTextSample.length > 8000 ? "\n…[truncated]" : ""}

## PDF AcroForm field names (fill each when possible)
${fieldList}

Instructions:
- When form field names exist: return "entries" with one object per field name listed above. Use the exact "key" string. Split and adapt the reviewer notes into the appropriate fields. If a field is not applicable, use "N/A" or a short dash.
- When NO form fields were listed: return "sections" only: 4–12 sections with short titles matching themes from the template text (e.g. Technical skills, Communication, Overall recommendation) and bodies drawn from the notes.
- Keep each text value under ${MAX_FIELD_CHARS} characters. Be concise and professional.`;

  if (params.formFieldNames.length > 0) {
    const { output } = await generateText({
      model: gateway("openai/gpt-4o-mini"),
      output: Output.object({
        name: "evaluation_form_fill",
        schema: aiMappingSchema,
      }),
      system:
        "You output only structured JSON per schema. Keys must match PDF field names exactly.",
      prompt,
      temperature: 0.2,
      maxOutputTokens: 4096,
    });

    const fieldMap: Record<string, string> = {};
    const allowed = new Set(params.formFieldNames);
    for (const e of output.entries) {
      if (!allowed.has(e.key)) continue;
      fieldMap[e.key] = e.text.slice(0, MAX_FIELD_CHARS);
    }
    for (const name of params.formFieldNames) {
      if (fieldMap[name] == null || fieldMap[name] === "") {
        fieldMap[name] = params.reviewerNotes.trim().slice(0, MAX_FIELD_CHARS) || "—";
      }
    }
    return { fieldMap, appendixSections: [] };
  }

  const { output } = await generateText({
    model: gateway("openai/gpt-4o-mini"),
    output: Output.object({
      name: "evaluation_sections",
      schema: aiSectionSchema,
    }),
    system:
      "You output only structured JSON. Derive section titles from the evaluation template wording.",
    prompt,
    temperature: 0.2,
    maxOutputTokens: 4096,
  });

  const appendixSections = output.sections.map((s) => ({
    title: s.title.slice(0, 200),
    body: s.body.slice(0, MAX_FIELD_CHARS),
  }));
  if (appendixSections.length === 0) {
    return {
      fieldMap: {},
      appendixSections: [
        {
          title: "Evaluator notes",
          body: params.reviewerNotes.trim().slice(0, MAX_FIELD_CHARS) || "—",
        },
      ],
    };
  }
  return { fieldMap: {}, appendixSections };
}

/**
 * Apply AI output to a copy of the template PDF and return serialized bytes.
 */
export async function renderFilledEvaluationPdf(params: {
  templatePdfBytes: Uint8Array;
  fill: FillEvaluationAiResult;
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(params.templatePdfBytes, {
    ignoreEncryption: true,
  });

  const form = pdfDoc.getForm();
  const fields = form.getFields();
  const fieldMap = Object.fromEntries(
    Object.entries(params.fill.fieldMap).map(([k, v]) => [
      k,
      sanitizeForPdfStandardFont(v),
    ]),
  );
  const appendixSections = params.fill.appendixSections.map((s) => ({
    title: sanitizeForPdfStandardFont(s.title),
    body: sanitizeForPdfStandardFont(s.body),
  }));

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

  if (fields.length > 0) {
    try {
      form.flatten();
    } catch {
      // some PDFs fail flatten; still save
    }
  }

  if (appendixSections.length > 0) {
    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    let y = height - 48;
    const margin = 48;
    const lineHeight = 13;
    const maxW = width - margin * 2;

    const wrap = (text: string, size: number, f: typeof font) => {
      const words = text.split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let line = "";
      for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(next, size) <= maxW) line = next;
        else {
          if (line) lines.push(line);
          line = w;
        }
      }
      if (line) lines.push(line);
      return lines;
    };

    page.drawText("Completed evaluation (AI-assisted)", {
      x: margin,
      y,
      size: 14,
      font: bold,
      color: rgb(0.1, 0.15, 0.25),
    });
    y -= 28;

    for (const block of appendixSections) {
      for (const ln of wrap(block.title, 11, bold)) {
        if (y < 56) break;
        page.drawText(ln, {
          x: margin,
          y,
          size: 11,
          font: bold,
          color: rgb(0.15, 0.15, 0.2),
        });
        y -= lineHeight;
      }
      y -= 4;
      for (const ln of wrap(block.body, 10, font)) {
        if (y < 44) break;
        page.drawText(ln, {
          x: margin,
          y,
          size: 10,
          font,
          color: rgb(0.25, 0.25, 0.28),
        });
        y -= lineHeight;
      }
      y -= 10;
    }
  }

  return pdfDoc.save();
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
