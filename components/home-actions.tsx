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
    <Button variant="primary" onPress={() => router.push("/login")}>
      Sign in
    </Button>
  );
}
