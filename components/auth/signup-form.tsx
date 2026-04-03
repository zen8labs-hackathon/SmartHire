"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { signUp, type AuthFormState } from "@/app/auth/actions";
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
      {pending ? "Creating account…" : children}
    </Button>
  );
}

export function SignUpForm() {
  const [state, formAction] = useActionState<AuthFormState, FormData>(
    signUp,
    null,
  );

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      {state?.error ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Sign up failed</Alert.Title>
            <Alert.Description>{state.error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      {state?.message ? (
        <Alert status="success">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Almost there</Alert.Title>
            <Alert.Description>{state.message}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <TextField
        isRequired
        name="email"
        type="email"
        autoComplete="email"
        validate={(value) => {
          const v = value.trim();
          if (!v) return "Email is required.";
          if (v.length < 5) return "Enter a valid email.";
          return null;
        }}
      >
        <Label>Email</Label>
        <Input placeholder="you@gmail.com" />
        <Description>Use a real address you can access if confirmation email is on.</Description>
        <FieldError />
      </TextField>

      <TextField
        isRequired
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
      >
        <Label>Password</Label>
        <Input placeholder="••••••••" />
        <Description>At least 8 characters.</Description>
        <FieldError />
      </TextField>

      <SubmitButton>Create account</SubmitButton>
    </form>
  );
}
