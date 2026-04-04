import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { normalizeEmail } from "@/lib/auth/email";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_RESULTS = 25;
const MAX_PAGES = 25;

/**
 * Search existing Auth users by email substring (HR autocomplete for JD viewers).
 */
export async function GET(request: Request) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const q = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (q.length < 2) {
    return Response.json({ accounts: [] as { email: string }[] });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return Response.json(
      { error: "Server missing service role key for account search." },
      { status: 500 },
    );
  }

  const matches: { email: string }[] = [];
  const seen = new Set<string>();
  let page = 1;
  const perPage = 1000;

  try {
    while (matches.length < MAX_RESULTS && page <= MAX_PAGES) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage,
      });
      if (error) {
        return Response.json({ error: error.message }, { status: 500 });
      }
      for (const u of data.users) {
        const raw = u.email?.trim();
        if (!raw) continue;
        const em = normalizeEmail(raw);
        if (!em.includes(q) || seen.has(em)) continue;
        seen.add(em);
        matches.push({ email: em });
        if (matches.length >= MAX_RESULTS) break;
      }
      if (data.users.length < perPage) break;
      page += 1;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Account search failed.";
    return Response.json({ error: msg }, { status: 500 });
  }

  return Response.json({ accounts: matches });
}
