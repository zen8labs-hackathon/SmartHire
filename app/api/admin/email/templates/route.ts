import { z } from "zod";

import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import {
  createEmailTemplate,
  listEmailTemplates,
} from "@/lib/db/email-templates";
import { getPool, withTransaction } from "@/lib/db/config/client";
import {
  listAttachmentsForTemplateIds,
  replaceTemplateAttachments,
} from "@/lib/db/email-attachments";
import { EMAIL_TRIGGER_CATEGORIES, EMAIL_TRIGGER_TYPES } from "@/lib/email/trigger-types";

const triggerTypeValues = EMAIL_TRIGGER_TYPES.map((t) => t.value) as [
  string,
  ...string[],
];

const attachmentSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  storagePath: z.string().min(1),
  fileSize: z.number().int().positive(),
});

const createSchema = z.object({
  name: z.string().min(1).max(255),
  triggerType: z.enum(triggerTypeValues),
  language: z.string().min(2).max(10).optional(),
  subjectTemplate: z.string().min(1),
  bodyTemplate: z.string().min(1),
  isAutoSend: z.boolean().optional(),
  requireApproval: z.boolean().optional(),
  isActive: z.boolean().optional(),
  defaultCc: z.string().nullable().optional(),
  defaultBcc: z.string().nullable().optional(),
  sendOffsetMinutes: z.number().int().optional(),
  attachments: z.array(attachmentSchema).max(10).optional(),
});

export async function GET(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const triggerType = url.searchParams.get("triggerType");
  const isActiveParam = url.searchParams.get("isActive");

  const triggerTypes =
    category &&
    (EMAIL_TRIGGER_CATEGORIES as readonly string[]).includes(category)
      ? EMAIL_TRIGGER_TYPES.filter((t) => t.category === category).map(
          (t) => t.value,
        )
      : undefined;

  const result = await listEmailTemplates(getPool(), {
    triggerType: triggerType ?? undefined,
    triggerTypes,
    isActive:
      isActiveParam === "true" ? true : isActiveParam === "false" ? false : undefined,
    limit: Number(url.searchParams.get("limit")) || undefined,
    offset: Number(url.searchParams.get("offset")) || undefined,
  });

  const attachmentsByTemplate = await listAttachmentsForTemplateIds(
    getPool(),
    result.rows.map((t) => t.id),
  );
  const rows = result.rows.map((t) => ({
    ...t,
    attachments: attachmentsByTemplate.get(t.id) ?? [],
  }));

  return Response.json({ ...result, rows });
}

/** Any staff member can create a template; editing/deleting is limited to its creator or an Admin (see `[id]/route.ts`). */
export async function POST(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }

  const { attachments, ...templateInput } = parsed.data;

  const { template, savedAttachments } = await withTransaction(async (db) => {
    const template = await createEmailTemplate(db, {
      ...templateInput,
      createdBy: auth.userId,
    });
    const savedAttachments = attachments?.length
      ? await replaceTemplateAttachments(db, template.id, attachments)
      : [];
    return { template, savedAttachments };
  });

  return Response.json(
    { template: { ...template, attachments: savedAttachments } },
    { status: 201 },
  );
}
