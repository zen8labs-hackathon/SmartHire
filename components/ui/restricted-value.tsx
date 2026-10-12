import type { ReactNode } from "react";
import { isRestricted, type MaybeRestricted } from "@/lib/authz/restricted";
import { LockChip } from "./lock-chip";

/** Renders the value, or a "Restricted" chip with the reason — never an empty cell. */
export function RestrictedValue<T>({
  value,
  children,
  label,
}: {
  value: MaybeRestricted<T>;
  children: (value: T) => ReactNode;
  label?: string;
}) {
  if (isRestricted(value)) return <LockChip label={label} reason={value.reason} />;
  return <>{children(value as T)}</>;
}
