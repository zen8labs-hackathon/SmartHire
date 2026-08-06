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

        {/* Scrollable page body. `scrollbar-gutter: stable` always reserves the
            vertical scrollbar's width, even when a page's content is short
            enough not to need it -- without this, switching between tabs/pages
            whose content heights straddle the viewport (e.g. a long list vs a
            short form) shifts the available width by the scrollbar's size,
            visibly jumping the layout. */}
        <main className="flex-1 overflow-y-auto bg-background p-6 md:p-8 [scrollbar-gutter:stable]">
          <div className="mx-auto w-full max-w-7xl animate-in fade-in slide-in-from-bottom-2 duration-300">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
