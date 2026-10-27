/**
 * Restricted-data pattern (UX-06).
 * Hidden values are removed on the SERVER: a restricted field carries only a
 * marker and a reason, never the value, so it cannot leak through the payload.
 */
export type Restricted = { restricted: true; reason: string };
export type MaybeRestricted<T> = T | Restricted;

export function isRestricted(value: unknown): value is Restricted {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { restricted?: unknown }).restricted === true
  );
}

/** Returns the value when allowed, otherwise a marker that does not contain it. */
export function restrict<T>(value: T, allowed: boolean, reason: string): MaybeRestricted<T> {
  return allowed ? value : { restricted: true, reason };
}

/** Replace the listed fields with restriction markers when not allowed. */
export function restrictFields<T extends object, K extends keyof T>(
  row: T,
  fields: readonly K[],
  allowed: boolean,
  reason: string,
): { [P in keyof T]: P extends K ? MaybeRestricted<T[P]> : T[P] } {
  if (allowed) return row as never;
  const copy = { ...(row as Record<string, unknown>) };
  for (const f of fields) copy[f as string] = { restricted: true, reason } satisfies Restricted;
  return copy as never;
}
