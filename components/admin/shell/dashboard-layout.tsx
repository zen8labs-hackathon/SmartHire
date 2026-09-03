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

        {/* Scrollable page body. `scrollbar-gutter: stable` reserves the
            scrollbar's width even when content fits, so switching between a
            short and a tall view (e.g. the Candidates page's tabs) doesn't
            shift the whole layout by the scrollbar width. */}
        <main className="flex-1 overflow-y-auto bg-background p-6 [scrollbar-gutter:stable] md:p-8">
          <div className="mx-auto w-full max-w-7xl animate-in fade-in slide-in-from-bottom-2 duration-300">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
