import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getStaffProfileAccess,
  type StaffProfileAccess,
} from "@/lib/admin/profile-access";
import { getSupabasePublishableKey } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type StaffRequestAuthResult =
  | {
      ok: true;
      userId: string;
      access: StaffProfileAccess;
      supabase: SupabaseClient;
    }
  | { ok: false; response: Response };

/**
 * Authenticated user with recruiter access (work_chapter set or is_admin).
 */
export async function requireStaffForRequest(
  request: Request,
): Promise<StaffRequestAuthResult> {
  const raw = request.headers.get("Authorization");
  const bearer = raw?.startsWith("Bearer ") ? raw.slice(7).trim() : "";

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
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
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
    if (!access?.isStaff) {
      return {
        ok: false,
        response: Response.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
    return { ok: true, userId: user.id, access, supabase };
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
  if (!access?.isStaff) {
    return {
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, userId: user.id, access, supabase };
}

/**
 * HR / admin only (full product management).
 */
export async function requireHrForRequest(
  request: Request,
): Promise<StaffRequestAuthResult> {
  const base = await requireStaffForRequest(request);
  if (!base.ok) return base;
  if (!base.access.isHr) {
    return {
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return base;
}
