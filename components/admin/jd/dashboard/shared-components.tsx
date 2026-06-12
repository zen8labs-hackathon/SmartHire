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
}: {
  chapters: readonly { id: string; name: string }[];
  selectedIds: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
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
      {chapters.map((c) => (
        <label
          key={c.id}
          className="flex cursor-pointer items-center gap-2 text-sm"
        >
          <input
            type="checkbox"
            className="rounded border-divider"
            checked={selectedIds.includes(c.id)}
            onChange={() => toggle(c.id)}
          />
          <span>{c.name}</span>
        </label>
      ))}
    </div>
  );
}
