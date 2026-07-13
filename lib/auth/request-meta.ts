import { headers } from "next/headers";

import type { SessionMeta } from "@/lib/auth/session";

/** Best-effort audit metadata for a `refresh_tokens` row -- never used in the auth decision itself. */
export async function getRequestMeta(): Promise<SessionMeta> {
  const h = await headers();
  return {
    userAgent: h.get("user-agent"),
    // `x-forwarded-for` can list multiple hops; take the client-nearest one.
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  };
}
