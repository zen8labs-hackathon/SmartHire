"use client";

import { useRouter } from "next/navigation";
import { UserDropdown } from "./user-dropdown";
import { NotificationBell } from "./notification-bell";
import { ArrowLeft, Search, PanelLeftClose, PanelLeftOpen } from "lucide-react";

export type HeaderProps = {
  userEmail: string;
  isHr: boolean;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
};

export function Header({
  userEmail,
  isHr,
  sidebarCollapsed,
  onToggleSidebar,
}: HeaderProps) {
  const router = useRouter();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-divider bg-surface px-4 font-sans md:px-6">
      {/* Left section: sidebar toggle + back navigation */}
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleSidebar}
          className="sh-iconbtn"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
        <button
          onClick={() => router.back()}
          className="sh-iconbtn"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Search (⌘K hint) */}
      <div className="mx-4 hidden max-w-[440px] flex-1 items-center gap-2 rounded-md border border-divider bg-surface-subtle px-3 py-1.5 text-body text-muted md:flex">
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate">Search positions, candidates…</span>
        <kbd className="rounded border border-divider bg-surface px-1.5 text-caption">⌘K</kbd>
      </div>

      {/* Right section: Notifications + UserDropdown */}
      <div className="flex items-center gap-2">
        <NotificationBell />
        <UserDropdown userEmail={userEmail} isHr={isHr} />
      </div>
    </header>
  );
}
