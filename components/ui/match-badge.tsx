import { Eye, Sparkles } from "lucide-react";

export type MatchBand = "strong" | "good" | "partial" | "limited" | "review";

const BANDS: Record<MatchBand, { segs: number; label: string }> = {
  strong: { segs: 4, label: "Strong match" },
  good: { segs: 3, label: "Good match" },
  partial: { segs: 2, label: "Partial match" },
  limited: { segs: 1, label: "Limited match" },
  review: { segs: 0, label: "Needs manual review" },
};

/** Maps a 0–100 score onto a DS match band. */
export function scoreToBand(score: number | null | undefined): MatchBand {
  if (score == null || Number.isNaN(score)) return "review";
  if (score >= 80) return "strong";
  if (score >= 65) return "good";
  if (score >= 45) return "partial";
  return "limited";
}

function segColor(band: MatchBand) {
  if (band === "limited") return "var(--z8-green-300)";
  if (band === "partial" || band === "good") return "var(--match-good)";
  return "var(--match-strong)";
}

type MatchBadgeProps = {
  band?: MatchBand;
  score?: number | null;
  label?: string;
  showScore?: boolean;
  className?: string;
};

/** AI match indicator. Green bands only — a low match is never shown in red. */
export function MatchBadge({ band, score, label, showScore = true, className }: MatchBadgeProps) {
  const b = band ?? scoreToBand(score);
  const cfg = BANDS[b];
  const text = label ?? cfg.label;
  const cls = `sh-match${b === "review" ? " sh-match--review" : ""}${className ? ` ${className}` : ""}`;

  return (
    <span className={cls} title={`AI match: ${text}`}>
      {b === "review" ? (
        <Eye size={11} aria-hidden className="text-muted" />
      ) : (
        <Sparkles size={11} aria-hidden className="text-ai" />
      )}
      {b !== "review" ? (
        <span className="sh-match__bar" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="sh-match__seg"
              style={i < cfg.segs ? { background: segColor(b) } : undefined}
            />
          ))}
        </span>
      ) : null}
      {text}
      {showScore && score != null && b !== "review" ? (
        <span className="sh-match__num">{Math.round(score)}</span>
      ) : null}
    </span>
  );
}
