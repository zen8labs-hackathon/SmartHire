import { z } from "zod";

import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { getPool } from "@/lib/db/config/client";
import { getEmailSettings, updateEmailSettings } from "@/lib/db/email-settings";

const updateSchema = z.object({
  defaultSender: z.string().email().optional(),
  companyName: z.string().min(1).optional(),
  layoutType: z.enum(["default", "custom"]).optional(),
  customLayoutHtml: z.string().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
});

export async function GET(request: Request) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const settings = await getEmailSettings(getPool());
  return Response.json({ settings });
}

export async function PUT(request: Request) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }

  const settings = await updateEmailSettings(getPool(), parsed.data);
  return Response.json({ settings });
}
