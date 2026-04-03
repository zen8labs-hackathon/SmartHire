"use client";

import { useFormStatus } from "react-dom";

import { signOut } from "@/app/auth/actions";
import { Button } from "@heroui/react";

function SignOutInner() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" isDisabled={pending}>
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}

export function SignOutForm() {
  return (
    <form action={signOut}>
      <SignOutInner />
    </form>
  );
}
