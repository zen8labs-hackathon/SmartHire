import { Button, Card, Chip, Modal } from "@heroui/react";

import type { JdPipelineApplicationRow } from "@/lib/candidates/campaign-applied-table-row";
import { jdMatchChipColor } from "@/lib/candidates/candidate-display";
import {
  jdRequirementSourceLabel,
  jdRequirementVerdictStyle,
  parseJdMatchRationale,
  sortJdRequirements,
  type JdRequirementCheck,
} from "@/lib/candidates/jd-match-rationale";

/** Card accent + badge tint per verdict colour. */
const REQUIREMENT_STYLE: Record<
  ReturnType<typeof jdRequirementVerdictStyle>["color"],
  { card: string; badge: string }
> = {
  success: {
    card: "border-l-success bg-success/[0.04]",
    badge: "bg-success/10 text-success",
  },
  warning: {
    card: "border-l-warning bg-warning/[0.04]",
    badge: "bg-warning/10 text-warning",
  },
  danger: {
    card: "border-l-danger bg-danger/[0.04]",
    badge: "bg-danger/10 text-danger",
  },
  default: {
    card: "border-l-divider bg-muted/[0.04]",
    badge: "bg-muted/10 text-muted",
  },
};

function RequirementRow({ check }: { check: JdRequirementCheck }) {
  const style = jdRequirementVerdictStyle(check.verdict);
  const tone = REQUIREMENT_STYLE[style.color];

  return (
    <Card
      variant="transparent"
      className={`!block !gap-0 !rounded-lg !px-4 !py-3 !shadow-none border-l-4 ${tone.card}`}
    >
      <div className="flex items-center gap-2">
        <span
          aria-label={style.label}
          className={`flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold leading-none ${tone.badge}`}
        >
          {style.icon}
        </span>
        <span className="whitespace-nowrap text-[0.6875rem] font-bold uppercase tracking-wide text-muted">
          {jdRequirementSourceLabel(check.source)}
        </span>
      </div>
      <p className="mt-1.5 text-sm font-semibold leading-snug text-foreground">
        {check.requirement}
      </p>
      {check.evidence ? (
        <p className="mt-2 rounded-md bg-background/60 px-3 py-2 text-sm leading-snug text-muted">
          {check.evidence}
        </p>
      ) : null}
    </Card>
  );
}

type RationaleModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  row: JdPipelineApplicationRow | null;
};

/**
 * Read-only view of the AI's JD-match rationale for a candidate's active CV
 * version (`campaign_applied.jd_match_rationale`), alongside the numeric
 * score it explains.
 *
 * Runs scored before the per-requirement checklist shipped (and formula-only
 * fallbacks, which never ran an LLM) hold plain prose in that column --
 * `parseJdMatchRationale` returns those with no `requirements`, and they keep
 * the original single-paragraph layout until someone rescores.
 */
export function RationaleModal({
  isOpen,
  onOpenChange,
  row,
}: RationaleModalProps) {
  const score =
    row?.jd_match_status === "completed" && row.jd_match_score != null
      ? Math.round(row.jd_match_score)
      : null;

  const rationale = parseJdMatchRationale(row?.jd_match_rationale);
  const requirements = rationale ? sortJdRequirements(rationale.requirements) : [];

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-2xl overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-divider px-5 py-4">
            <Modal.Heading className="flex items-center gap-2 text-lg font-bold text-foreground">
              JD match reasoning
              {score != null ? (
                <Chip
                  size="sm"
                  variant="soft"
                  color={jdMatchChipColor({ jdMatchScore: score })}
                  className="min-w-[3.25rem] justify-center text-sm font-bold tabular-nums"
                >
                  {score}
                </Chip>
              ) : null}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
            {row?.jd_match_status === "failed" ? (
              <p className="text-sm text-danger">
                {row.jd_match_error ?? "Scoring failed."}
              </p>
            ) : rationale ? (
              <>
                {rationale.summary ? (
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {rationale.summary}
                  </p>
                ) : null}
                {rationale.meta ? (
                  <p className="whitespace-pre-wrap text-xs text-muted">
                    {rationale.meta}
                  </p>
                ) : null}
                {requirements.length > 0 ? (
                  <div className="space-y-2 border-t border-divider pt-4 first:border-t-0 first:pt-0">
                    {requirements.map((check, i) => (
                      <RequirementRow key={`${check.requirement}-${i}`} check={check} />
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted">
                No reasoning available for this candidate yet.
              </p>
            )}
          </Modal.Body>
          <Modal.Footer className="justify-end border-t border-divider px-5 py-4">
            <Button variant="secondary" onPress={() => onOpenChange(false)}>
              Close
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
