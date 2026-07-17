"use client";

export type ChapterOption = { id: string; name: string };

/**
 * Checklist of chapters with a Member/Head segmented toggle per selected chapter.
 * Shared by the invite-user and edit-user-access forms.
 */
export function ChapterRolePicker({
  chapters,
  selectedChapterIds,
  headChapterIds,
  onToggleChapter,
  onToggleHead,
}: {
  chapters: readonly ChapterOption[];
  selectedChapterIds: string[];
  headChapterIds: string[];
  onToggleChapter: (id: string) => void;
  onToggleHead: (id: string) => void;
}) {
  if (chapters.length === 0) {
    return (
      <p className="text-sm text-muted">
        No chapters defined yet. Add them under Setup → Chapters first.
      </p>
    );
  }

  return (
    <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-divider p-2">
      {chapters.map((c) => {
        const checked = selectedChapterIds.includes(c.id);
        const isHead = headChapterIds.includes(c.id);
        return (
          <div
            key={c.id}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5 ${
              checked ? "bg-accent/5" : ""
            }`}
          >
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="rounded border-divider"
                checked={checked}
                onChange={() => onToggleChapter(c.id)}
              />
              <span>{c.name}</span>
            </label>
            {checked ? (
              <div className="flex overflow-hidden rounded-full border border-divider text-xs">
                <button
                  type="button"
                  onClick={() => isHead && onToggleHead(c.id)}
                  className={`px-2.5 py-1 transition-colors ${
                    !isHead
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-muted hover:bg-default-100"
                  }`}
                >
                  Member
                </button>
                <button
                  type="button"
                  onClick={() => !isHead && onToggleHead(c.id)}
                  className={`px-2.5 py-1 transition-colors ${
                    isHead
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-muted hover:bg-default-100"
                  }`}
                >
                  Head
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
