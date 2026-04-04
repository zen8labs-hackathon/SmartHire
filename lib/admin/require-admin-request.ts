import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getStaffProfileAccess } from "@/lib/admin/profile-access";
import { getSupabasePublishableKey } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type AdminRequestAuthResult =
  | {
      ok: true;
      userId: string;
      /** Authenticated user email when present (e.g. CV upload attribution). */
      userEmail: string | null;
      supabase: SupabaseClient;
    }
  | { ok: false; response: Response };

/**
 * HR-level auth (full product management): `is_admin` or `work_chapter = HR`.
 * Prefers `Authorization: Bearer` from the browser and falls back to cookies.
 */
export async function requireAdminForRequest(
  request: Request,
): Promise<AdminRequestAuthResult> {
  const raw = request.headers.get("Authorization");
  const bearer =
    raw?.startsWith("Bearer ") ? raw.slice(7).trim() : "";

  if (bearer) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = getSupabasePublishableKey();
    if (!url || !key) {
      return {
        ok: false,
        response: Response.json(
          { error: "Missing Supabase URL or publishable key." },
          { status: 500 },
        ),
      };
    }

    const supabase = createSupabaseJsClient(url, key, {
      global: {
        headers: { Authorization: `Bearer ${bearer}` },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(bearer);
    if (error || !user?.id) {
      return {
        ok: false,
        response: Response.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }
    const access = await getStaffProfileAccess(supabase, user.id);
    if (!access?.isHr) {
      return {
        ok: false,
        response: Response.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
    return {
      ok: true,
      userId: user.id,
      userEmail: user.email ?? null,
      supabase,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return {
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const access = await getStaffProfileAccess(supabase, user.id);
  if (!access?.isHr) {
    return {
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return {
    ok: true,
    userId: user.id,
    userEmail: user.email ?? null,
    supabase,
  };
}
