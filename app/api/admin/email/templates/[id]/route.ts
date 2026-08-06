import { z } from "zod";

import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { getPool, withTransaction } from "@/lib/db/config/client";
import {
  getEmailTemplateById,
  softDeleteEmailTemplate,
  updateEmailTemplate,
} from "@/lib/db/email-templates";
import {
  listAttachmentsForTemplate,
  replaceTemplateAttachments,
} from "@/lib/db/email-attachments";
import { EMAIL_RECIPIENT_TYPES, EMAIL_TRIGGER_TYPES } from "@/lib/email/trigger-types";

type RouteContext = { params: Promise<{ id: string }> };

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

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  triggerType: z.enum(triggerTypeValues).optional(),
  recipientType: z.enum(EMAIL_RECIPIENT_TYPES).optional(),
  language: z.string().min(2).max(10).optional(),
  subjectTemplate: z.string().min(1).optional(),
  bodyTemplate: z.string().min(1).optional(),
  isAutoSend: z.boolean().optional(),
  requireApproval: z.boolean().optional(),
  isActive: z.boolean().optional(),
  defaultCc: z.string().nullable().optional(),
  defaultBcc: z.string().nullable().optional(),
  sendOffsetMinutes: z.number().int().optional(),
  /** Omit to leave the attachment set untouched; pass (possibly []) to fully replace it. */
  attachments: z.array(attachmentSchema).max(10).optional(),
});

function parseId(raw: string): string | null {
  return /^\d+$/.test(raw) ? raw : null;
}

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const templateId = parseId(id);
  if (!templateId) return Response.json({ error: "Invalid id." }, { status: 400 });

  const db = getPool();
  const template = await getEmailTemplateById(db, templateId);
  if (!template) return Response.json({ error: "Not found." }, { status: 404 });

  const attachments = await listAttachmentsForTemplate(db, templateId);

  return Response.json({ template: { ...template, attachments } });
}

export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const templateId = parseId(id);
  if (!templateId) return Response.json({ error: "Invalid id." }, { status: 400 });

  const existing = await getEmailTemplateById(getPool(), templateId);
  if (!existing) return Response.json({ error: "Not found." }, { status: 404 });
  if (!auth.access.isAdmin && existing.created_by !== auth.userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

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

  const { attachments, ...patch } = parsed.data;

  const result = await withTransaction(async (db) => {
    const template = await updateEmailTemplate(db, templateId, patch);
    if (!template) return null;
    const savedAttachments =
      attachments !== undefined
        ? await replaceTemplateAttachments(db, templateId, attachments)
        : await listAttachmentsForTemplate(db, templateId);
    return { template, savedAttachments };
  });
  if (!result) return Response.json({ error: "Not found." }, { status: 404 });

  return Response.json({
    template: { ...result.template, attachments: result.savedAttachments },
  });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const templateId = parseId(id);
  if (!templateId) return Response.json({ error: "Invalid id." }, { status: 400 });

  const existing = await getEmailTemplateById(getPool(), templateId);
  if (!existing) return Response.json({ error: "Not found." }, { status: 404 });
  if (!auth.access.isAdmin && existing.created_by !== auth.userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const deleted = await softDeleteEmailTemplate(getPool(), templateId);
  if (!deleted) return Response.json({ error: "Not found." }, { status: 404 });

  return new Response(null, { status: 204 });
}
