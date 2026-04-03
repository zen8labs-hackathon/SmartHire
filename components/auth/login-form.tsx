"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { signIn, type AuthFormState } from "@/app/auth/actions";
import {
  Alert,
  Button,
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
      {pending ? "Signing in…" : children}
    </Button>
  );
}

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(
    signIn,
    null,
  );

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <input type="hidden" name="next" value={nextPath} />

      {state?.error ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Sign-in failed</Alert.Title>
            <Alert.Description>{state.error}</Alert.Description>
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
        <FieldError />
      </TextField>

      <TextField
        isRequired
        name="password"
        type="password"
        autoComplete="current-password"
        minLength={8}
      >
        <Label>Password</Label>
        <Input placeholder="••••••••" />
        <FieldError />
      </TextField>

      <SubmitButton>Sign in</SubmitButton>
    </form>
  );
}
