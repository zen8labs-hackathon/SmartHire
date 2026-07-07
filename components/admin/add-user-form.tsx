"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  adminAddUser,
  type AdminUserFormState,
} from "@/app/admin/actions";
import {
  Alert,
  Button,
  Description,
  FieldError,
  Input,
  Label,
  ListBox,
  Select,
  TextField,
} from "@heroui/react";

type RecruitingAccessKey = "none" | "hr" | "chapter";

export type AddUserChapterOption = { id: string; name: string };

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="w-full"
      variant="primary"
      isDisabled={pending}
    >
      {pending ? "Creating…" : children}
    </Button>
  );
}

export function AddUserForm({
  chapters,
}: {
  chapters: readonly AddUserChapterOption[];
}) {
  const [state, formAction] = useActionState<AdminUserFormState, FormData>(
    adminAddUser,
    null,
  );
  const [recruitingAccess, setRecruitingAccess] =
    useState<RecruitingAccessKey>("none");
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [headChapterIds, setHeadChapterIds] = useState<string[]>([]);

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
            <Alert.Title>Could not create user</Alert.Title>
            <Alert.Description>{state.error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      {state?.message ? (
        <Alert status="success">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Done</Alert.Title>
            <Alert.Description>{state.message}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <TextField
        isRequired
        name="email"
        type="email"
        autoComplete="off"
        validate={(value) => {
          const v = value.trim().toLowerCase();
          if (!v) return "Email is required.";
          if (v.length < 5) return "Enter a valid email.";
          return null;
        }}
      >
        <Label>Email</Label>
        <Input placeholder="new.user@gmail.com" />
        <FieldError />
      </TextField>

      <TextField
        isRequired
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
      >
        <Label>Initial password</Label>
        <Input placeholder="••••••••" />
        <Description>At least 8 characters. Share it securely with the user.</Description>
        <FieldError />
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
          job (by email or whole chapter) to open that job.
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
                            name={`chapter_role_${c.id}`}
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
                            name={`chapter_role_${c.id}`}
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
          <Description>
            Head can open JDs granted to this chapter (and everything under
            them); member keeps chapter membership but cannot.
          </Description>
        </div>
      ) : null}

      <SubmitButton>Add user</SubmitButton>
    </form>
  );
}
