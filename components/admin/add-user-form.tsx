"use client";

import { useActionState } from "react";
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
  TextField,
} from "@heroui/react";

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

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
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

      <SubmitButton>Add user</SubmitButton>
    </form>
  );
}
