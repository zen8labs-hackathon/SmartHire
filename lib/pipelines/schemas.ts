import { z } from "zod";

export const pipelineStageSchema = z.object({
  code: z
    .string()
    .min(1, "Code is required")
    .max(50, "Code must be at most 50 characters")
    .regex(
      /^[a-z0-9_]+$/,
      "Code must contain only lowercase letters, numbers, and underscores (no spaces)",
    ),
  label: z
    .string()
    .min(1, "Label is required")
    .max(100, "Label must be at most 100 characters"),
  desc: z
    .string()
    .max(255, "Description must be at most 255 characters")
    .optional()
    .nullable()
    .transform((val) => (val?.trim() === "" ? null : val)),
  color: z
    .string()
    .max(50, "Color must be at most 50 characters")
    .optional()
    .nullable()
    .transform((val) => (val?.trim() === "" ? null : val)),
  allow_schedule: z.boolean().default(false),
  stage_type: z
    .string()
    .min(1)
    .max(30, "Stage type must be at most 30 characters")
    .regex(/^[a-z0-9_]+$/, "Stage type must be lowercase letters, numbers, and underscores")
    .optional(),
});

export type PipelineStageFormValues = z.infer<typeof pipelineStageSchema>;

export type PipelineStageRow = PipelineStageFormValues & {
  id: string;
  created_at: string;
  updated_at: string;
};

export const pipelineSubStageSchema = z.object({
  pipeline_stage_id: z.string().uuid("Invalid stage ID"),
  code: z
    .string()
    .min(1, "Code is required")
    .max(50, "Code must be at most 50 characters")
    .regex(
      /^[a-z0-9_]+$/,
      "Code must contain only lowercase letters, numbers, and underscores (no spaces)",
    ),
  label: z
    .string()
    .min(1, "Label is required")
    .max(100, "Label must be at most 100 characters"),
  sequence_number: z
    .number()
    .int("Sequence number must be an integer")
    .min(1, "Sequence number must be at least 1"),
  is_default: z.boolean().default(false),
  is_passed: z.boolean().default(false),
  is_terminal: z.boolean().default(false),
  requires_reason: z.boolean().default(false),
  requires_decision: z.boolean().default(false),
  is_withdraw: z.boolean().default(false),
});

export type PipelineSubStageFormValues = z.infer<typeof pipelineSubStageSchema>;

export type PipelineSubStageRow = PipelineSubStageFormValues & {
  id: string;
  created_at: string;
};

export const pipelineRowSchema = z.object({
  stageCode: z.string().min(1, "Stage is required").max(50),
  slaDays: z
    .number()
    .int("SLA must be a whole number of days")
    .min(0, "SLA must be 0 or more")
    .max(365, "SLA must be at most 365 days")
    .default(5),
  schedule: z.boolean().default(false),
});

const pipelineRowsSchema = z
  .array(pipelineRowSchema)
  .min(1, "A pipeline needs at least one stage")
  .max(50, "A pipeline can have at most 50 stages")
  .refine(
    (rows) => new Set(rows.map((r) => r.stageCode)).size === rows.length,
    "A stage can only appear once in a pipeline",
  );

const pipelineNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(100, "Name must be at most 100 characters");

export const createPipelineSchema = z.object({
  name: pipelineNameSchema,
  rows: pipelineRowsSchema,
});

export const updatePipelineSchema = z
  .object({
    name: pipelineNameSchema.optional(),
    rows: pipelineRowsSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.rows !== undefined, "Nothing to update");

const codeSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9_]+$/, "Code must contain only lowercase letters, numbers, and underscores");

export const librarySubSchema = z.object({
  code: codeSchema,
  label: z.string().trim().min(1, "Every step needs a name").max(100),
  def: z.boolean().default(false),
  pass: z.boolean().default(false),
  terminal: z.boolean().default(false),
  reason: z.boolean().default(false),
  decision: z.boolean().default(false),
  withdraw: z.boolean().default(false),
});

export const libraryStageBodySchema = z
  .object({
    label: z.string().trim().min(1, "Give the stage a name").max(100),
    desc: z.string().max(255).default(""),
    color: z.string().max(50).default(""),
    type: z.string().min(1).max(30).regex(/^[a-z0-9_]+$/).default("none"),
    subs: z.array(librarySubSchema).min(1, "A stage needs at least one step").max(30),
  })
  .superRefine((v, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (new Set(v.subs.map((s) => s.code)).size !== v.subs.length) fail("Step names must be unique");
    if (v.subs.filter((s) => s.def).length !== 1) fail("Every stage needs exactly one entry step");
    if (v.subs.some((s) => s.withdraw && !s.terminal)) fail("A withdraw step must end the application");
    if (!v.subs.some((s) => s.pass)) fail("Mark at least one step as passing");
    if (v.subs.some((s) => s.def && s.terminal)) fail("The entry step can’t end the application");
    if (v.subs.some((s) => s.pass && s.terminal)) fail("A passing step can’t also end the application");
  });

export const createLibraryStageSchema = libraryStageBodySchema.and(z.object({ code: codeSchema }));
