"use client";

import { useState, useTransition } from "react";
import {
  Button,
  Description,
  Label,
  ListBox,
  Select,
  TextField,
  Input,
} from "@heroui/react";
import { adminUpdateUserAccess } from "@/app/admin/actions";
import { useToast } from "@/components/admin/toast-provider";

type RecruitingAccessKey = "none" | "hr" | "chapter";

export type EditUserChapterOption = { id: string; name: string };

export type EditUserData = {
  id: string;
  email: string;
  recruitingAccess: RecruitingAccessKey;
  chapterIds: string[];
  chapterHeadIds: string[];
};

export function EditUserForm({
  chapters,
  initialData,
  onSuccess,
  onCancel,
}: {
  chapters: readonly EditUserChapterOption[];
  initialData: EditUserData;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { success: triggerSuccess, error: triggerError } = useToast();
  const [isPending, startTransition] = useTransition();

  const [recruitingAccess, setRecruitingAccess] = useState<RecruitingAccessKey>(
    initialData.recruitingAccess
  );
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>(
    initialData.chapterIds
  );
  const [headChapterIds, setHeadChapterIds] = useState<string[]>(
    initialData.chapterHeadIds
  );

  function toggleChapter(id: string) {
    setSelectedChapterIds((prev) => {
      if (prev.includes(id)) {
        setHeadChapterIds((h) => h.filter((x) => x !== id));
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  }

  function toggleChapterHead(id: string) {
    setHeadChapterIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await adminUpdateUserAccess(
        initialData.id,
        recruitingAccess,
        selectedChapterIds,
        headChapterIds
      );

      if (res?.error) {
        triggerError(res.error);
      } else {
        triggerSuccess(res?.message || "User access updated successfully.");
        onSuccess();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <TextField isReadOnly name="email" value={initialData.email}>
        <Label>Email</Label>
        <Input className="opacity-70 cursor-not-allowed bg-surface-secondary/20" />
      </TextField>

      <div className="space-y-2">
        <Label className="text-sm font-medium text-foreground">
          Recruiting access
        </Label>
        <Select
          value={recruitingAccess}
          onChange={(k) => {
            const next = String(k ?? "none") as RecruitingAccessKey;
            if (next === "none" || next === "hr" || next === "chapter") {
              setRecruitingAccess(next);
              if (next !== "chapter") setSelectedChapterIds([]);
            }
          }}
        >
          <Select.Trigger className="w-full min-w-0">
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="none" textValue="Dashboard only">
                Dashboard only
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="hr" textValue="HR — full recruiting">
                HR — full recruiting
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="chapter" textValue="Chapter recruiter">
                Chapter recruiter
                <ListBox.ItemIndicator />
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
        <Description>
          Chapter recruiters need at least one chapter and must be granted on each
          job to open that job.
        </Description>
      </div>

      {recruitingAccess === "chapter" ? (
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">
            Chapters
          </Label>
          {chapters.length === 0 ? (
            <p className="text-sm text-muted">
              No chapters defined yet. Add them under Setup → Chapters first.
            </p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-divider p-3">
              {chapters.map((c) => {
                const checked = selectedChapterIds.includes(c.id);
                const isHead = headChapterIds.includes(c.id);
                return (
                  <div key={c.id} className="space-y-1">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="rounded border-divider"
                        checked={checked}
                        onChange={() => toggleChapter(c.id)}
                      />
                      <span>{c.name}</span>
                    </label>
                    {checked ? (
                      <div className="ml-6 flex items-center gap-3 text-xs text-muted">
                        <label className="flex cursor-pointer items-center gap-1">
                          <input
                            type="radio"
                            name={`edit_chapter_role_${c.id}`}
                            checked={!isHead}
                            onChange={() =>
                              isHead ? toggleChapterHead(c.id) : undefined
                            }
                          />
                          Member
                        </label>
                        <label className="flex cursor-pointer items-center gap-1">
                          <input
                            type="radio"
                            name={`edit_chapter_role_${c.id}`}
                            checked={isHead}
                            onChange={() =>
                              isHead ? undefined : toggleChapterHead(c.id)
                            }
                          />
                          Head (can view this chapter&apos;s JDs)
                        </label>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-3 mt-4">
        <Button
          type="button"
          variant="secondary"
          onPress={onCancel}
          isDisabled={isPending}
          className="h-9 px-4 rounded-xl border border-divider text-xs font-semibold hover:bg-surface-secondary"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          isDisabled={isPending}
          className="h-9 px-4 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent/90"
        >
          {isPending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
