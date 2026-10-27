"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./button";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  /** State the consequence: what changes, who is affected, whether it can be undone. */
  consequence: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Confirmation that names the consequence (F0.3). role=alertdialog, Escape
 * cancels, focus lands on Cancel (the safe choice) and returns to the opener,
 * Tab is trapped inside.
 */
export function ConfirmDialog({
  open,
  title,
  consequence,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive,
  loading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => opener?.focus?.();
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key !== "Tab") return;
    const f = ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled)");
    if (!f || f.length === 0) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="sh-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="sh-dialog max-w-[440px]"
        onKeyDown={onKeyDown}
      >
        <div className="sh-dialog__head">
          <div>
            <h2 id={titleId} className="sh-dialog__title">{title}</h2>
            <div id={descId} className="sh-dialog__desc">{consequence}</div>
          </div>
        </div>
        <div className="sh-dialog__foot">
          <button ref={cancelRef} type="button" className="sh-btn sh-btn--secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
