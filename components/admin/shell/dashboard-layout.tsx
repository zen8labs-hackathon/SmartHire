"use client";

import React, { useState } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

export type DashboardLayoutProps = {
  userEmail: string;
  isHr: boolean;
  chapterIds: string[];
  children: React.ReactNode;
};

export function DashboardLayout({
  userEmail,
  isHr,
  chapterIds,
  children,
}: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans">
      {/* Sidebar navigation */}
      <Sidebar
        userEmail={userEmail}
        isHr={isHr}
        chapterIds={chapterIds}
        collapsed={sidebarCollapsed}
      />

      {/* Main content pane */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header bar */}
        <Header
          userEmail={userEmail}
          isHr={isHr}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
        />

        {/* Scrollable page body */}
        <main className="flex-1 overflow-y-auto bg-surface-secondary/20 p-6 md:p-8">
          <div className="mx-auto w-full max-w-7xl animate-in fade-in slide-in-from-bottom-2 duration-300">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
