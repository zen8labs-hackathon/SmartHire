import { MatchBadge, type MatchBand } from "./match-badge";

type FitSignalProps = {
  band?: MatchBand;
  score?: number | null;
  /** Hide the caption where space is tight (the text stays for screen readers). */
  compact?: boolean;
};

/** Fit level first, score second, green only, always framed as one signal. */
export function FitSignal({ band, score, compact = false }: FitSignalProps) {
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <MatchBadge band={band} score={score} />
      <span className={compact ? "sr-only" : "text-caption text-muted"}>One signal, not a ranking</span>
    </span>
  );
}
