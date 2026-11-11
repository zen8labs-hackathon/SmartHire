import { requireUserForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionOnJob } from "@/lib/authz/require-permission";
import { withTransaction } from "@/lib/db/config/client";
import { getPositionReport } from "@/lib/position/get-position-report";
import { renderPositionReportPdf } from "@/lib/position/render-position-report-pdf";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, context: Context) {
  const auth = await requireUserForRequest(request);

  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  if (!UUID_RE.test(id)) {
    return Response.json(
      { error: "Invalid position ID." },
      { status: 400 },
    );
  }

  try {
    const jobPermission = await requirePermissionOnJob(
      auth.access,
      "job.view",
      id,
    );

    if (!jobPermission.ok) return jobPermission.response;

    const candidatePermission = await requirePermissionOnJob(
      auth.access,
      "candidate.view",
      id,
    );

    if (!candidatePermission.ok) {
      return candidatePermission.response;
    }

    const report = await withTransaction(async (db) => {
      await db.query(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );

      return getPositionReport(db, id);
    });

    if (!report) {
      return Response.json(
        { error: "Position not found." },
        { status: 404 },
      );
    }

    const bytes = await renderPositionReportPdf(report);

    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          `attachment; filename="position-${id}-report.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[position-report] Export failed", error);

    return Response.json(
      { error: "Could not generate position report." },
      { status: 500 },
    );
  }
}
