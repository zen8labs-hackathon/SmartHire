import type { LibraryStageInput } from "@/lib/db/pipeline-library";
import type { libraryStageBodySchema } from "@/lib/pipelines/schemas";
import type { z } from "zod";

export function toLibraryInput(
  b: z.infer<typeof libraryStageBodySchema>,
  code: string,
): LibraryStageInput {
  return {
    code,
    label: b.label,
    desc: b.desc.trim() || null,
    color: b.color.trim() || null,
    stageType: b.type,
    subs: b.subs.map((s) => ({
      code: s.code,
      label: s.label,
      isDefault: s.def,
      isPassed: s.pass,
      isTerminal: s.terminal,
      requiresReason: s.reason,
      requiresDecision: s.decision,
      isWithdraw: s.withdraw,
    })),
  };
}
