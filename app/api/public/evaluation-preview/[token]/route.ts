import { getCandidateEvaluationReviewByToken } from "@/lib/db/candidate-evaluation-reviews";
import { getPool } from "@/lib/db/config/client";
import { downloadObject } from "@/lib/storage/s3";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const clean = token?.trim() ?? "";
  if (!/^[0-9a-f]{48}$/i.test(clean)) {
    return new Response("Not found", { status: 404 });
  }

  const review = await getCandidateEvaluationReviewByToken(getPool(), clean);
  if (!review || review.revoked_at || review.expires_at.getTime() < Date.now()) {
    return new Response("Not found", { status: 404 });
  }

  let buf: Buffer;
  try {
    buf = await downloadObject(review.filled_pdf_storage_path);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="evaluation.pdf"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
