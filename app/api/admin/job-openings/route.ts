import { requireAdminForRequest } from "@/lib/admin/require-admin-request";

type JdEmbed = { position: string };

function positionFromEmbed(
  embed: JdEmbed | JdEmbed[] | null,
): string | undefined {
  if (embed == null) return undefined;
  const row = Array.isArray(embed) ? embed[0] : embed;
  return row?.position;
}

export async function GET(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { supabase } = auth;
  const { data, error } = await supabase
    .from("job_openings")
    .select(
      `
      id,
      title,
      status,
      job_descriptions (
        position
      )
    `,
    )
    .not("job_description_id", "is", null)
    .order("created_at", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const jobOpenings = rows.map((row: {
    id: string;
    title: string;
    status: string;
    job_descriptions: JdEmbed | JdEmbed[] | null;
  }) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    displayTitle: positionFromEmbed(row.job_descriptions) ?? row.title,
  }));

  return Response.json({ jobOpenings });
}
