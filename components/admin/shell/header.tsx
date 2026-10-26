"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { UserDropdown } from "./user-dropdown";
import { useBreadcrumbs } from "./page-title";
import { NotificationBell } from "./notification-bell";
import { ArrowLeft, ChevronRight, Search, PanelLeftClose, PanelLeftOpen } from "lucide-react";

export type HeaderProps = {
  userEmail: string;
  isHr: boolean;
  /** Notification feed is staff-only (`/api/admin/notifications/stream` 403s otherwise). */
  showNotifications?: boolean;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
};

export function Header({
  userEmail,
  isHr,
  showNotifications = true,
  sidebarCollapsed,
  onToggleSidebar,
}: HeaderProps) {
  const router = useRouter();
  const crumbs = useBreadcrumbs();

  return (
    <header className="hd-top">
      {/* Left section: sidebar toggle + back navigation */}
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <button
          onClick={onToggleSidebar}
          className="sh-iconbtn"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </button>
        {crumbs && crumbs.length > 0 ? (
          <nav aria-label="Breadcrumb" className="ml-2 flex min-w-0 items-center gap-1.5 text-[14px]">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <React.Fragment key={i}>
                  {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />}
                  {c.href && !last ? (
                    <Link href={c.href} className="shrink-0 text-muted hover:text-heading">{c.label}</Link>
                  ) : (
                    <span aria-current={last ? "page" : undefined} className={last ? "min-w-0 truncate font-semibold text-heading" : "text-muted"}>{c.label}</span>
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        ) : (
          <button onClick={() => router.back()} className="sh-iconbtn" aria-label="Go back">
            <ArrowLeft />
          </button>
        )}
      </div>

      {/* Search (⌘K hint) */}
      <div className="hd-search max-md:hidden" role="search">
        <Search aria-hidden />
        <span>Search candidates, jobs, people…</span>
        <kbd>⌘K</kbd>
      </div>

      <div className="flex flex-1 items-center justify-end gap-4">
        {showNotifications && <NotificationBell />}
        <UserDropdown userEmail={userEmail} isHr={isHr} />
      </div>
    </header>
  );
}
