import { z } from "zod";

import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { getCandidateById, updateCandidate } from "@/lib/db/candidates";
import { getPool } from "@/lib/db/config/client";
import { isUniqueViolation } from "@/lib/db/query-helpers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ candidateId: string }> };

/** One candidate's profile row from the `candidates` table (no application / CV data). */
export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { candidateId } = await params;
  if (!candidateId || !UUID_RE.test(candidateId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const candidate = await getCandidateById(getPool(), candidateId);
  if (!candidate) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  return Response.json({ candidate });
}

/** Trimmed string; empty string collapses to `null` (an explicit clear). */
const nullableString = z
  .string()
  .trim()
  .transform((s) => (s.length === 0 ? null : s))
  .nullable();

const updateBodySchema = z
  .object({
    name: nullableString.optional(),
    email: nullableString.optional(),
    phone: nullableString.optional(),
    degree: nullableString.optional(),
    education: nullableString.optional(),
    role: nullableString.optional(),
    experienceYears: z.number().min(0).max(80).nullable().optional(),
    skills: z.array(z.string().trim().min(1)).max(100).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one field to update.",
  });

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { candidateId } = await params;
  if (!candidateId || !UUID_RE.test(candidateId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = updateBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }

  const patch = { ...parsed.data };
  if (typeof patch.email === "string") {
    patch.email = patch.email.toLowerCase();
  }

  try {
    const candidate = await updateCandidate(getPool(), candidateId, patch);
    if (!candidate) {
      return Response.json({ error: "Not found." }, { status: 404 });
    }
    return Response.json({ candidate });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return Response.json(
        { error: "A candidate with this email or phone already exists." },
        { status: 409 },
      );
    }
    const message =
      e instanceof Error ? e.message : "Failed to update candidate.";
    return Response.json({ error: message }, { status: 500 });
  }
}
