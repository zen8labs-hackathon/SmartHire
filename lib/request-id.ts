import { headers } from "next/headers";

export const REQUEST_ID_HEADER = "x-request-id";
export const REQUEST_ID_LOG_FIELD = "X-Request-Id";

export function createRequestId(): string {
  return crypto.randomUUID();
}

export function normalizeRequestId(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getRequestIdFromRequest(
  request: Pick<Request, "headers">,
): string | undefined {
  return normalizeRequestId(request.headers.get(REQUEST_ID_HEADER));
}

export async function getCurrentRequestId(): Promise<string | undefined> {
  const h = await headers();
  return normalizeRequestId(h.get(REQUEST_ID_HEADER));
}

export function withRequestId(
  data?: Record<string, unknown>,
  requestId?: string,
): Record<string, unknown> | undefined {
  if (!requestId) return data;
  return {
    [REQUEST_ID_LOG_FIELD]: requestId,
    ...data,
  };
}
