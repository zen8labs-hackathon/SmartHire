import { z } from "zod";

import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { canViewSalary } from "@/lib/authz/can";
import {
  getCampaignAppliedById,
  updateCampaignApplied,
} from "@/lib/db/campaign-applied";
import { getCandidateById } from "@/lib/db/candidates";
import { getPool } from "@/lib/db/config/client";
import { PROFILE_EXPECTED_SALARY_MAX } from "@/lib/candidates/candidate-profile-patch";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{ candidateId: string; id: string }>;
};

/** Resolve + authorize the application; returns it plus the salary-view flag. */
async function loadApplication(
  request: Request,
  params: RouteContext["params"],
) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return { ok: false as const, response: auth.response };

  const { candidateId, id } = await params;
  if (!candidateId || !UUID_RE.test(candidateId) || !id || !UUID_RE.test(id)) {
    return {
      ok: false as const,
      response: Response.json({ error: "Not found." }, { status: 404 }),
    };
  }

  const db = getPool();

  const candidate = await getCandidateById(db, candidateId);
  if (!candidate) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Candidate not found." },
        { status: 404 },
      ),
    };
  }

  const application = await getCampaignAppliedById(db, id);
  if (!application || application.candidate_id !== candidateId) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Application not found." },
        { status: 404 },
      ),
    };
  }

  const canView = await canViewSalary(db, auth.access, application.job_id);
  return { ok: true as const, db, application, canView };
}

export async function GET(request: Request, { params }: RouteContext) {
  const loaded = await loadApplication(request, params);
  if (!loaded.ok) return loaded.response;

  const { application, canView } = loaded;
  return Response.json({
    expectedSalary: canView ? application.expected_salary : null,
    canView,
  });
}

/** Trimmed string; empty string / null collapse to `null` (an explicit clear). */
const bodySchema = z.object({
  expectedSalary: z
    .union([z.string().max(PROFILE_EXPECTED_SALARY_MAX), z.null()])
    .transform((v) => {
      if (v === null) return null;
      const t = v.trim();
      return t.length === 0 ? null : t;
    }),
});

export async function PATCH(request: Request, { params }: RouteContext) {
  const loaded = await loadApplication(request, params);
  if (!loaded.ok) return loaded.response;

  const { db, application, canView } = loaded;
  if (!canView) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }

  const updated = await updateCampaignApplied(db, application.id, {
    expectedSalary: parsed.data.expectedSalary,
  });
  if (!updated) {
    return Response.json(
      { error: "Could not update expected salary." },
      { status: 500 },
    );
  }

  return Response.json({ expectedSalary: updated.expected_salary, canView });
}
