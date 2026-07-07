"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  adminUpdateUserAccess,
  type AdminUserFormState,
} from "@/app/admin/actions";
import { ChapterRolePicker, type ChapterOption } from "@/components/admin/chapter-role-picker";
import type { OrgUserRow } from "@/lib/admin/list-org-users";
import {
  Alert,
  Button,
  Description,
  Label,
  ListBox,
  Select,
} from "@heroui/react";

type RecruitingAccessKey = "none" | "hr" | "chapter";

function initialAccessKey(user: OrgUserRow): RecruitingAccessKey {
  if (user.workChapter === "HR") return "hr";
  if (user.chapterMemberships.length > 0) return "chapter";
  return "none";
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="w-full"
      variant="primary"
      isDisabled={pending}
    >
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

export function EditUserAccessForm({
  user,
  chapters,
  onSaved,
}: {
  user: OrgUserRow;
  chapters: readonly ChapterOption[];
  onSaved?: () => void;
}) {
  const [state, formAction] = useActionState<AdminUserFormState, FormData>(
    adminUpdateUserAccess,
    null,
  );
  const [recruitingAccess, setRecruitingAccess] =
    useState<RecruitingAccessKey>(initialAccessKey(user));
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>(
    user.chapterMemberships.map((m) => m.chapterId),
  );
  const [headChapterIds, setHeadChapterIds] = useState<string[]>(
    user.chapterMemberships
      .filter((m) => m.role === "head")
      .map((m) => m.chapterId),
  );

  useEffect(() => {
    if (state?.message) onSaved?.();
  }, [state, onSaved]);

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
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <input type="hidden" name="user_id" value={user.id} />
      <input type="hidden" name="recruiting_access" value={recruitingAccess} />
      {selectedChapterIds.map((id) => (
        <input key={id} type="hidden" name="chapter_ids" value={id} />
      ))}
      {headChapterIds.map((id) => (
        <input key={`head-${id}`} type="hidden" name="chapter_head_ids" value={id} />
      ))}

      {state?.error ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Could not update user</Alert.Title>
            <Alert.Description>{state.error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <div>
        <Label className="text-sm font-medium text-foreground">Email</Label>
        <p className="mt-1 truncate font-mono text-sm text-muted">
          {user.email}
        </p>
      </div>

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
              if (next !== "chapter") {
                setSelectedChapterIds([]);
                setHeadChapterIds([]);
              }
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
      </div>

      {recruitingAccess === "chapter" ? (
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">
            Chapters
          </Label>
          <ChapterRolePicker
            chapters={chapters}
            selectedChapterIds={selectedChapterIds}
            headChapterIds={headChapterIds}
            onToggleChapter={toggleChapter}
            onToggleHead={toggleChapterHead}
          />
          <Description>
            Head can open JDs granted to this chapter (and everything under
            them); member keeps chapter membership but cannot.
          </Description>
        </div>
      ) : null}

      <SubmitButton />
    </form>
  );
}
