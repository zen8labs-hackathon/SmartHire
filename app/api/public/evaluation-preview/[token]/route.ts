import { CANDIDATE_EVAL_FILLED_BUCKET } from "@/lib/evaluation/filled-pdf-bucket";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { token } = await context.params;
  const clean = token?.trim() ?? "";
  if (!/^[0-9a-f]{48}$/i.test(clean)) {
    return new Response("Not found", { status: 404 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return new Response("Server configuration error", { status: 500 });
  }

  const { data: row, error } = await admin
    .from("candidate_evaluation_reviews")
    .select("filled_pdf_storage_path")
    .eq("preview_token", clean)
    .maybeSingle();

  if (error || !row) {
    return new Response("Not found", { status: 404 });
  }

  const path = (row as { filled_pdf_storage_path: string }).filled_pdf_storage_path;
  const { data: blob, error: dlErr } = await admin.storage
    .from(CANDIDATE_EVAL_FILLED_BUCKET)
    .download(path);

  if (dlErr || !blob) {
    return new Response("Not found", { status: 404 });
  }

  const buf = Buffer.from(await blob.arrayBuffer());

  const url = new URL(request.url);
  const asDownload = url.searchParams.get("download") === "1";

  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": asDownload
        ? 'attachment; filename="evaluation.pdf"'
        : 'inline; filename="evaluation.pdf"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
