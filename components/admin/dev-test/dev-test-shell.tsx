"use client";

import { useState } from "react";

import { EmailTestPanel } from "@/components/admin/dev-test/email-test-panel";

type Tab = "email";

/**
 * Shared home for one-off dev-only test tools -- currently just the Graph
 * mail-send check (`EmailTestPanel`), but built as a tab shell (matching
 * components/admin/email-config/email-config-shell.tsx's pattern) so a
 * future test panel is just another `TABS` entry + hidden-div block, not a
 * new page/route/sidebar item. See app/admin/dev-test/page.tsx for the
 * dev-only + HR-only gate.
 */
const TABS: { id: Tab; label: string }[] = [{ id: "email", label: "Email" }];

export function DevTestShell() {
  const [activeTab, setActiveTab] = useState<Tab>("email");

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

      <div className={activeTab === "email" ? undefined : "hidden"}>
        <EmailTestPanel />
      </div>
    </div>
  );
}
