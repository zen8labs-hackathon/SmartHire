"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Filter, X } from "lucide-react";
import { Button } from "./button";

export type FilterOption = { value: string; label: string; count: number };

export type FilterPopoverProps = {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
};

/** Multi-select filter showing how many rows each option would match. */
export function FilterPopover({ label, options, selected, onChange }: FilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <div
      ref={root}
      className="relative inline-block"
      onKeyDown={(e) => e.key === "Escape" && open && (setOpen(false), e.stopPropagation())}
    >
      <Button
        variant="secondary"
        size="sm"
        icon={Filter}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        {selected.length > 0 ? ` (${selected.length})` : ""}
      </Button>
      {open ? (
        <div id={id} role="dialog" aria-label={`Filter by ${label}`} className="sh-menu absolute left-0 top-full z-20 mt-1 border border-divider bg-surface shadow-overlay rounded-lg">
          <ul className="m-0 list-none p-0">
            {options.map((o) => (
              <li key={o.value}>
                <label className="sh-menu__item">
                  <input
                    type="checkbox"
                    checked={selected.includes(o.value)}
                    onChange={() => toggle(o.value)}
                  />
                  <span className="flex-1">{o.label}</span>
                  <span className="text-caption text-muted tabular-nums" aria-label={`${o.count} results`}>
                    {o.count}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export type Condition = { key: string; label: string };

/** Active filter conditions as removable chips plus Clear all. */
export function ConditionChips({
  conditions,
  onRemove,
  onClearAll,
}: {
  conditions: Condition[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
}) {
  if (conditions.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Active filters">
      {conditions.map((c) => (
        <span key={c.key} className="sh-chip sh-chip--outline">
          {c.label}
          <button
            type="button"
            className="sh-iconbtn sh-iconbtn--sm"
            aria-label={`Remove filter ${c.label}`}
            onClick={() => onRemove(c.key)}
          >
            <X size={12} aria-hidden />
          </button>
        </span>
      ))}
      <Button variant="ghost" size="sm" onClick={onClearAll}>
        Clear all
      </Button>
    </div>
  );
}

/** Appears when rows are selected; announces the count politely. */
export function BulkActionBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children?: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div role="region" aria-label="Bulk actions" className="flex items-center gap-3 rounded-lg border border-divider bg-surface px-3 py-2 shadow-overlay">
      <span aria-live="polite" className="text-table font-semibold">
        {count} selected
      </span>
      {children}
      <Button variant="ghost" size="sm" onClick={onClear} className="ml-auto">
        Deselect all
      </Button>
    </div>
  );
}
