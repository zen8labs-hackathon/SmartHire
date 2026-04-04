import { requireAdminForRequest } from "@/lib/admin/require-admin-request";

export async function GET(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { supabase } = auth;
  const { data, error } = await supabase
    .from("job_openings")
    .select("id, title, status")
    .order("created_at", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ jobOpenings: data ?? [] });
}
