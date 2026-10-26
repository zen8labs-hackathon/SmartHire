"use client";

import React, { useState } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { PageTitleProvider } from "./page-title";

export type DashboardLayoutProps = {
  userEmail: string;
  isHr: boolean;
  chapterIds: string[];
  isChapterHead?: boolean;
  isStaff?: boolean;
  children: React.ReactNode;
};

export function DashboardLayout({
  userEmail,
  isHr,
  chapterIds,
  isChapterHead = false,
  isStaff = true,
  children,
}: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <PageTitleProvider>
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans">
      {/* Sidebar navigation */}
      <Sidebar
        userEmail={userEmail}
        isHr={isHr}
        chapterIds={chapterIds}
        isChapterHead={isChapterHead}
        collapsed={sidebarCollapsed}
      />

      {/* Main content pane */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header bar */}
        <Header
          userEmail={userEmail}
          isHr={isHr}
          showNotifications={isStaff}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
        />

        {/* Scrollable page body. `scrollbar-gutter: stable` reserves the
            scrollbar's width even when content fits, so switching between a
            short and a tall view (e.g. the Candidates page's tabs) doesn't
            shift the whole layout by the scrollbar width. */}
        <main className="flex-1 overflow-y-auto bg-background px-4 py-4 [scrollbar-gutter:stable] md:px-6">
          <div className="w-full min-w-0">
            {children}
          </div>
        </main>
      </div>
    </div>
    </PageTitleProvider>
  );
}
