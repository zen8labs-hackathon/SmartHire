import { UnrecoverableError } from "bullmq";
import { toError } from "@/lib/logger";

/**
 * Wraps a caught error (from a try-catch) as a BullMQ `UnrecoverableError`,
 * so the job fails permanently instead of being retried
 */
export function toUnrecoverableError(
  e: unknown,
  message?: string,
): UnrecoverableError {
  if (e instanceof UnrecoverableError) return e;

  const original = toError(e);
  const unrecoverable = new UnrecoverableError(
    message ?? original?.message ?? String(e),
  );
  if (original?.stack) unrecoverable.stack = original.stack;
  unrecoverable.cause = original ?? e;

  return unrecoverable;
}
