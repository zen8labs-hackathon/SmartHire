import { CANDIDATE_EVAL_TEMPLATE_BUCKET } from "@/lib/admin/candidate-evaluation-template-constants";
import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return Response.json(
      { error: "Server missing service role key." },
      { status: 500 },
    );
  }

  const { data: row, error } = await auth.supabase
    .from("candidate_evaluation_template")
    .select("storage_path, original_filename, mime_type")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const storagePath = (row as { storage_path: string | null } | null)?.storage_path;
  if (!storagePath) {
    return Response.json({ error: "No template uploaded." }, { status: 404 });
  }

  const originalFilename =
    (row as { original_filename: string | null } | null)?.original_filename?.trim() ||
    "evaluation-template.pdf";
  const mimeType =
    (row as { mime_type: string | null } | null)?.mime_type?.trim() ||
    "application/pdf";

  const { data: blob, error: dlErr } = await admin.storage
    .from(CANDIDATE_EVAL_TEMPLATE_BUCKET)
    .download(storagePath);
  if (dlErr || !blob) {
    return Response.json({ error: dlErr?.message ?? "Template not found." }, { status: 404 });
  }

  const bytes = Buffer.from(await blob.arrayBuffer());
  const url = new URL(request.url);
  const asDownload = url.searchParams.get("download") === "1";

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `${asDownload ? "attachment" : "inline"}; filename="${originalFilename.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=120",
    },
  });
}
