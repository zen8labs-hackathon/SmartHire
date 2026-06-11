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
});

export type PipelineSubStageFormValues = z.infer<typeof pipelineSubStageSchema>;

export type PipelineSubStageRow = PipelineSubStageFormValues & {
  id: string;
  created_at: string;
};
