import { headers } from "next/headers";

import { normalizeRequestId, REQUEST_ID_HEADER } from "@/lib/request-id";

export async function getCurrentRequestId(): Promise<string | undefined> {
  const h = await headers();
  return normalizeRequestId(h.get(REQUEST_ID_HEADER));
}
