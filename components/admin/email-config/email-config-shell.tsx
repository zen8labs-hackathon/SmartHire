"use client";

import { use, useState } from "react";

import { EmailLogsTab } from "@/components/admin/email-config/email-logs-tab";
import { EmailSettingsTab } from "@/components/admin/email-config/email-settings-tab";
import { EmailTemplatesTab } from "@/components/admin/email-config/email-templates-tab";
import type { EmailTemplateListItem } from "@/components/admin/email-config/types";

type Tab = "templates" | "settings" | "logs";

const TABS: { id: Tab; label: string }[] = [
  { id: "templates", label: "Email Template" },
  { id: "settings", label: "Settings" },
  { id: "logs", label: "Email Logs" },
];

export function EmailConfigShell({
  templatesPromise,
  isAdmin,
  currentUserId,
}: {
  templatesPromise: Promise<EmailTemplateListItem[]>;
  isAdmin: boolean;
  currentUserId: string;
}) {
  const initialTemplates = use(templatesPromise);
  const [activeTab, setActiveTab] = useState<Tab>("templates");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex border-b border-divider">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 pb-2.5 text-sm font-semibold tracking-wide border-b-2 transition-all duration-150 hover:cursor-pointer ${
              activeTab === tab.id
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* All three panels stay mounted (hidden via CSS) rather than being
          swapped in/out -- unmounting on tab switch would reset each tab's
          local state (e.g. a just-created template) back to its initial
          props/fetch every time the user tabs away and back. */}
      <div className={activeTab === "templates" ? undefined : "hidden"}>
        <EmailTemplatesTab
          initialTemplates={initialTemplates}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
        />
      </div>
      <div className={activeTab === "settings" ? undefined : "hidden"}>
        <EmailSettingsTab />
      </div>
      <div className={activeTab === "logs" ? undefined : "hidden"}>
        <EmailLogsTab />
      </div>
    </div>
  );
}
