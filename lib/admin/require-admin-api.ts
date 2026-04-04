import { isProfileAdmin } from "@/lib/admin/config";
import { createClient } from "@/lib/supabase/server";

export type AdminAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

export async function requireAdminApi(): Promise<AdminAuthResult> {
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
  if (!(await isProfileAdmin(supabase, user.id))) {
    return {
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, userId: user.id };
}
