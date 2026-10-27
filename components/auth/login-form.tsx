"use client";

import { useTransition } from "react";
import { signIn } from "@/app/auth/actions";
import { useToast } from "@/components/admin/toast-provider";
import {
  Button,
  FieldError,
  Input,
  Label,
  TextField,
} from "@heroui/react";
import { Loader2 } from "lucide-react";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [isPending, startTransition] = useTransition();
  const { error: triggerError, success: triggerSuccess } = useToast();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        const res = await signIn(null, formData);
        if (res?.error) {
          triggerError(res.error);
        } else {
          triggerSuccess("Logged in successfully!");
        }
      } catch (err: any) {
        const isRedirect = 
          err.digest?.startsWith("NEXT_REDIRECT") || 
          err.message?.includes("NEXT_REDIRECT") ||
          err.message?.includes("redirect");

        if (isRedirect) {
          triggerSuccess("Logged in successfully!");
          throw err; // Re-throw so Next.js performs the navigation
        }
        triggerError(err.message || "An unexpected error occurred.");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-5">
      <input type="hidden" name="next" value={nextPath} />

      <TextField
        isRequired
        name="email"
        type="email"
        autoComplete="email"
        className="flex flex-col"
        validate={(value) => {
          const v = value.trim();
          if (!v) return "Email is required.";
          if (v.length < 5) return "Enter a valid email.";
          return null;
        }}
      >
        <Label className="mb-1.5 text-caption font-medium text-fg-2">
          Email address
        </Label>
        <Input 
          placeholder="you@gmail.com" 
          className="h-9 w-full rounded-md border border-border-field bg-surface px-3 text-body text-foreground outline-none transition-colors duration-[120ms] ease-standard placeholder:text-field-placeholder hover:border-neutral-500 focus:border-accent focus:shadow-[0_0_0_1px_var(--accent)]"
        />
        <FieldError className="mt-1.5 text-caption text-danger" />
      </TextField>

      <TextField
        isRequired
        name="password"
        type="password"
        autoComplete="current-password"
        className="flex flex-col"
        minLength={8}
      >
        <Label className="mb-1.5 text-caption font-medium text-fg-2">
          Password
        </Label>
        <Input 
          placeholder="••••••••" 
          className="h-9 w-full rounded-md border border-border-field bg-surface px-3 text-body text-foreground outline-none transition-colors duration-[120ms] ease-standard placeholder:text-field-placeholder hover:border-neutral-500 focus:border-accent focus:shadow-[0_0_0_1px_var(--accent)]"
        />
        <FieldError className="mt-1.5 text-caption text-danger" />
      </TextField>

      <Button
        type="submit"
        className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-body font-semibold text-accent-foreground hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        isDisabled={isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Signing in…</span>
          </>
        ) : (
          <span>Sign in</span>
        )}
      </Button>
    </form>
  );
}
