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
        <Label className="text-xs font-semibold text-foreground/80 tracking-wide mb-1.5">
          Email address
        </Label>
        <Input 
          placeholder="you@gmail.com" 
          className="w-full px-3.5 py-2.5 rounded-xl border border-divider bg-surface-secondary/40 text-sm text-foreground placeholder:text-muted outline-none transition-all duration-200 hover:border-accent/40 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:bg-background shadow-sm"
        />
        <FieldError className="text-xs font-medium text-danger mt-1.5 animate-in fade-in slide-in-from-top-1 duration-150" />
      </TextField>

      <TextField
        isRequired
        name="password"
        type="password"
        autoComplete="current-password"
        className="flex flex-col"
        minLength={8}
      >
        <Label className="text-xs font-semibold text-foreground/80 tracking-wide mb-1.5">
          Password
        </Label>
        <Input 
          placeholder="••••••••" 
          className="w-full px-3.5 py-2.5 rounded-xl border border-divider bg-surface-secondary/40 text-sm text-foreground placeholder:text-muted outline-none transition-all duration-200 hover:border-accent/40 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:bg-background shadow-sm"
        />
        <FieldError className="text-xs font-medium text-danger mt-1.5 animate-in fade-in slide-in-from-top-1 duration-150" />
      </TextField>

      <Button
        type="submit"
        className="w-full mt-2 py-2.5 px-4 bg-gradient-to-r from-accent to-indigo-600 hover:from-accent/90 hover:to-indigo-600/90 text-white rounded-xl text-sm font-semibold tracking-wide shadow-md shadow-accent/15 transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
