import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";

import { EmailConfigShell } from "@/components/admin/email-config/email-config-shell";
import type { EmailTemplateListItem } from "@/components/admin/email-config/types";
import { DataTableSkeleton } from "@/components/admin/shell/table-system";
import { PageHeader } from "@/components/admin/shell/page-header";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { getPool } from "@/lib/db/config/client";
import { listEmailTemplates } from "@/lib/db/email-templates";

export const metadata: Metadata = {
  title: "Email Config | Smart Hire Admin",
  description: "Manage email templates, settings, and send logs.",
};

async function getInitialTemplates(): Promise<EmailTemplateListItem[]> {
  const { rows } = await listEmailTemplates(getPool(), { limit: 200 });
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    trigger_type: t.trigger_type,
    language: t.language,
    subject_template: t.subject_template,
    body_template: t.body_template,
    is_auto_send: t.is_auto_send,
    require_approval: t.require_approval,
    is_active: t.is_active,
    default_cc: t.default_cc,
    default_bcc: t.default_bcc,
    send_offset_minutes: t.send_offset_minutes,
    created_by: t.created_by,
    created_at: t.created_at.toISOString(),
    updated_at: t.updated_at.toISOString(),
  }));
}

export default async function AdminEmailConfigPage() {
  const { user, access } = await getRequestAuth();
  if (!user) redirect("/login?next=/admin/email-config");
  if (!access?.isHr) redirect("/admin/jd");

  const templatesPromise = getInitialTemplates();

  return (
    <div className="flex flex-col gap-4 font-sans">
      <PageHeader
        title="Email Config"
        description="Manage email templates, general send settings, and view sent email logs."
      />

      <Suspense fallback={<DataTableSkeleton />}>
        <EmailConfigShell
          templatesPromise={templatesPromise}
          isAdmin={access.isAdmin}
          currentUserId={user.id}
        />
      </Suspense>
    </div>
  );
}
