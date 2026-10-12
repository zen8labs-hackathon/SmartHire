import { Lock } from "lucide-react";

type LockChipProps = {
  label?: string;
  reason?: string;
  className?: string;
};

/** Shown in place of data the viewer is not allowed to see. */
export function LockChip({ label = "Restricted", reason, className }: LockChipProps) {
  return (
    <span className={`sh-tooltip${className ? ` ${className}` : ""}`} tabIndex={reason ? 0 : undefined}>
      <span className="sh-chip sh-chip--lock">
        <Lock size={12} aria-hidden />
        {label}
      </span>
      {reason ? (
        <span role="tooltip" className="sh-tooltip__bubble">
          {reason}
        </span>
      ) : null}
    </span>
  );
}

/** Muted placeholder for a field that the CV parser could not find. */
export function NotFoundInCv({ label = "Not found in CV" }: { label?: string }) {
  return <span className="text-caption italic text-muted">{label}</span>;
}
