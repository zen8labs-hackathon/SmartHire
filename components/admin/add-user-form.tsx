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

export function AddUserForm() {
  const [state, formAction] = useActionState<AdminUserFormState, FormData>(
    adminAddUser,
    null,
  );
  const [recruitingAccess, setRecruitingAccess] =
    useState<RecruitingAccessKey>("none");

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <input type="hidden" name="recruiting_access" value={recruitingAccess} />
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
          Chapter names must match how candidates are labeled (e.g. Engineering).
          Grant JD access separately on each job description.
        </Description>
      </div>

      {recruitingAccess === "chapter" ? (
        <TextField
          isRequired
          name="work_chapter"
          autoComplete="off"
          validate={(value) => {
            const v = value.trim();
            if (!v) return "Chapter name is required.";
            if (v.length > 50) return "Max 50 characters.";
            return null;
          }}
        >
          <Label>Chapter name</Label>
          <Input placeholder="e.g. Engineering" />
          <FieldError />
        </TextField>
      ) : null}

      <SubmitButton>Add user</SubmitButton>
    </form>
  );
}
