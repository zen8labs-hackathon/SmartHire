import React from "react";

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
      {children}
    </p>
  );
}

export function ChapterPicker({
  chapters,
  selectedIds,
  onChange,
  lockedIds = [],
}: {
  chapters: readonly { id: string; name: string }[];
  selectedIds: readonly string[];
  onChange: (ids: string[]) => void;
  /** Selected chapters the user may not untick (e.g. a head's own chapter). */
  lockedIds?: readonly string[];
}) {
  function toggle(id: string) {
    if (lockedIds.includes(id) && selectedIds.includes(id)) return;
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );
  }

  if (chapters.length === 0) {
    return (
      <p className="text-xs text-muted">
        No chapters yet. Add them under Setup → Chapters.
      </p>
    );
  }

  return (
    <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-divider p-3">
      {chapters.map((c) => {
        const locked = lockedIds.includes(c.id) && selectedIds.includes(c.id);
        return (
          <label
            key={c.id}
            className={`flex items-center gap-2 text-sm ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}
            title={locked ? "Your own chapter — only HR can remove it." : undefined}
          >
            <input
              type="checkbox"
              className="rounded border-divider"
              checked={selectedIds.includes(c.id)}
              disabled={locked}
              onChange={() => toggle(c.id)}
            />
            <span>{c.name}</span>
            {locked ? <span className="text-xs text-muted">(your chapter)</span> : null}
          </label>
        );
      })}
    </div>
  );
}
