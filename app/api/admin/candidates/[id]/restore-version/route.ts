import { z } from "zod";
import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { getCampaignAppliedAdminRowById } from "@/lib/db/campaign-applied-list";
import { getCampaignAppliedById, updateCampaignApplied } from "@/lib/db/campaign-applied";
import { getCvDetailVersionById, getNextCvVersionNumber, createCvDetailVersion } from "@/lib/db/cv-detail-versions";
import { syncCandidateAggregateFields } from "@/lib/db/candidates";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { dbDateToIso } from "@/lib/db/query-helpers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

const restoreBodySchema = z
  .object({
    versionEventId: z
      .string()
      .regex(/^\d+$/)
      .transform((s) => s.trim()),
    note: z
      .string()
      .max(500)
      .optional()
      .transform((s) => (s === undefined ? undefined : s.trim() || undefined)),
  })
  .strict();

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId || !UUID_RE.test(campaignAppliedId)) {
    return Response.json({ error: "Invalid candidate id." }, { status: 400 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = restoreBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const db = getPool();

  const campaignApplied = await getCampaignAppliedById(db, campaignAppliedId);
  if (!campaignApplied) {
    return Response.json({ error: "Application not found." }, { status: 404 });
  }

  const targetCv = await getCvDetailVersionById(db, body.versionEventId);
  if (!targetCv) {
    return Response.json({ error: "CV version to restore not found." }, { status: 404 });
  }

  if (targetCv.campaign_applied_id !== campaignAppliedId) {
    return Response.json({ error: "Version event does not belong here." }, { status: 400 });
  }

  try {
    const nextVersion = await getNextCvVersionNumber(db, campaignAppliedId);

    await withTransaction(async (tx) => {
      const restored = await createCvDetailVersion(tx, {
        campaignAppliedId,
        versionNumber: nextVersion,
        sourceEvent: "restore",
        cvStoragePath: targetCv.cv_storage_path,
        originalFilename: targetCv.original_filename,
        mimeType: targetCv.mime_type,
        cvFileSha256: targetCv.cv_file_sha256,
        cvContentSha256: targetCv.cv_content_sha256,
        parsingStatus: targetCv.parsing_status,
        parsingError: targetCv.parsing_error,
        parsedPayload: targetCv.parsed_payload,
        skills: targetCv.skills,
        role: targetCv.role,
        degree: targetCv.degree,
        education: targetCv.education,
        experienceYears: targetCv.experience_years ? parseFloat(targetCv.experience_years) : null,
        gpa: targetCv.gpa,
        englishLevel: targetCv.english_level,
        dateOfBirth: dbDateToIso(targetCv.date_of_birth),
        studentYears: targetCv.student_years,
        matchedOn: targetCv.matched_on,
        changeSummary: body.note ?? null,
        createdBy: auth.userId,
      });

      await updateCampaignApplied(tx, campaignAppliedId, {
        activeCvVersionId: restored.id,
      });

      await syncCandidateAggregateFields(tx, campaignApplied.candidate_id);
    });

    const enriched = await getCampaignAppliedAdminRowById(db, campaignAppliedId);
    if (!enriched) {
      return Response.json({ error: "Could not load updated candidate." }, { status: 500 });
    }

    return Response.json({ candidate: enriched });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to restore version.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
