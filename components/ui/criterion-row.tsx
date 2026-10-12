import type { ReactNode } from "react";
import { AiLabel } from "./ai-label";
import { Chip, type ChipTone } from "./status-chip";

type CriterionRowProps = {
  requirement: string;
  weight?: string;
  verdict?: { label: string; tone?: ChipTone };
  evidence?: ReactNode;
  edited?: ReactNode;
};

/** One requirement from the JD checklist with AI verdict, CV evidence and edit trail. */
export function CriterionRow({ requirement, weight, verdict, evidence, edited }: CriterionRowProps) {
  return (
    <div className="sh-crit">
      <div className="sh-crit__req">
        {requirement} {weight ? <span className="sh-crit__weight">· {weight}</span> : null}
      </div>
      <div className="flex items-center gap-1.5">
        {verdict ? <Chip tone={verdict.tone ?? "neutral"}>{verdict.label}</Chip> : null}
        <AiLabel />
      </div>
      {evidence ? <div className="sh-crit__evidence">{evidence}</div> : null}
      {edited ? <div className="sh-crit__edited">{edited}</div> : null}
    </div>
  );
}
