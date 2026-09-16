"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { adminAddUser, type AdminUserFormState } from "@/app/admin/actions";
import {
  ChapterRolePicker,
  type ChapterOption,
} from "@/components/admin/chapter-role-picker";
import {
  Alert,
  Button,
  Checkbox,
  Description,
  FieldError,
  Input,
  Label,
  ListBox,
  Select,
  TextField,
} from "@heroui/react";
import { useToast } from "@/components/admin/toast-provider";

type RecruitingAccessKey = "hr" | "chapter";

export type AddUserChapterOption = ChapterOption;

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
  onSuccess,
}: {
  chapters: readonly AddUserChapterOption[];
  onSuccess?: () => void;
}) {
  const [state, setState] = useState<AdminUserFormState>(null);
  const { success: triggerSuccess } = useToast();

  const handleAction = async (formData: FormData) => {
    const res = await adminAddUser(null, formData);
    setState(res);
    if (res?.message) {
      triggerSuccess(res.message);
      if (onSuccess) {
        onSuccess();
      }
    }
  };
  const [ssoOnly, setSsoOnly] = useState(false);
  const [recruitingAccess, setRecruitingAccess] =
    useState<RecruitingAccessKey>("chapter");
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
    <form action={handleAction} className="flex w-full flex-col gap-4">
      <input type="hidden" name="sso_only" value={ssoOnly ? "true" : "false"} />
      <input type="hidden" name="recruiting_access" value={recruitingAccess} />
      {selectedChapterIds.map((id) => (
        <input key={id} type="hidden" name="chapter_ids" value={id} />
      ))}
      {headChapterIds.map((id) => (
        <input
          key={`head-${id}`}
          type="hidden"
          name="chapter_head_ids"
          value={id}
        />
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

      <Checkbox isSelected={ssoOnly} onChange={setSsoOnly}>
        <Checkbox.Content>
          <Checkbox.Control className="border-2 border-slate-600 dark:border-slate-400 rounded-md">
            <Checkbox.Indicator />
          </Checkbox.Control>
          <span>Sign in with Microsoft (no password)</span>
        </Checkbox.Content>
      </Checkbox>

      {!ssoOnly ? (
        <TextField
          isRequired
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
        >
          <Label>Initial password</Label>
          <Input placeholder="••••••••" />
          <Description>
            At least 8 characters. Share it securely with the user.
          </Description>
          <FieldError />
        </TextField>
      ) : (
        <Description>
          This user will link their SmartHire account on first "Sign in with
          Microsoft" using this email address.
        </Description>
      )}

      <div className="space-y-2">
        <Label className="text-sm font-medium text-foreground">
          Recruiting access
        </Label>
        <Select
          value={recruitingAccess}
          onChange={(k) => {
            const next = String(k ?? "chapter") as RecruitingAccessKey;
            if (next === "hr" || next === "chapter") {
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
          Chapter recruiters need at least one chapter and must be granted on
          each job (by email or whole chapter) to open that job.
        </Description>
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

      <SubmitButton>Add user</SubmitButton>
    </form>
  );
}
