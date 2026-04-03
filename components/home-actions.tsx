"use client";

import { useRouter } from "next/navigation";

import { Button } from "@heroui/react";

export function HomeActions({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();

  if (signedIn) {
    return (
      <Button variant="primary" onPress={() => router.push("/dashboard")}>
        Go to dashboard
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <Button variant="primary" onPress={() => router.push("/login")}>
        Sign in
      </Button>
      <Button variant="secondary" onPress={() => router.push("/signup")}>
        Sign up
      </Button>
    </div>
  );
}
