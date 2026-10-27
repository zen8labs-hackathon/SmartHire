"use client";

import { useRef, useState, type ReactNode } from "react";
import { MoveRight } from "lucide-react";

export type BoardStage = { id: string; label: string };

export type BoardCardProps = {
  title: string;
  /** Non-sensitive meta only (position, stage age). UX-04: never salary or contact details. */
  subtitle?: string;
  badge?: ReactNode;
  stageId: string;
  stages: BoardStage[];
  onMove: (toStageId: string) => void;
};

/**
 * Minimal kanban card. Moving never needs drag-and-drop (WCAG 2.5.7): use the
 * "Move to…" menu, or focus the card and press M.
 */
export function BoardCard({ title, subtitle, badge, stageId, stages, onMove }: BoardCardProps) {
  const [open, setOpen] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const targets = stages.filter((s) => s.id !== stageId);

  const close = () => {
    setOpen(false);
    card.current?.focus();
  };

  return (
    <div
      ref={card}
      tabIndex={0}
      role="group"
      aria-label={title}
      aria-keyshortcuts="M"
      className="relative rounded-lg border border-divider bg-surface p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      onKeyDown={(e) => {
        if (e.target === card.current && (e.key === "m" || e.key === "M")) {
          e.preventDefault();
          setOpen(true);
        }
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-body font-semibold">{title}</div>
          {subtitle ? <div className="truncate text-caption text-muted">{subtitle}</div> : null}
        </div>
        {badge}
      </div>
      <button
        type="button"
        className="sh-btn sh-btn--ghost sh-btn--sm mt-2"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <MoveRight size={14} aria-hidden /> Move to…
      </button>
      {open ? (
        <div role="menu" aria-label={`Move ${title} to`} className="sh-menu absolute left-3 top-full z-20 mt-1 rounded-lg border border-divider bg-surface shadow-overlay">
          {targets.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="menuitem"
              className="sh-menu__item w-full"
              autoFocus={i === 0}
              onClick={() => {
                onMove(s.id);
                close();
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
