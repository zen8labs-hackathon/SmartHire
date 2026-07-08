"use client";

import { useRouter } from "next/navigation";
import { UserDropdown } from "./user-dropdown";
import { Bell, ArrowLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";

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
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-divider bg-surface-primary px-6 font-sans">
      {/* Left section: sidebar toggle + back navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleSidebar}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-primary hover:bg-surface-secondary text-muted hover:text-foreground border border-divider/60 transition-all cursor-pointer"
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
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-primary hover:bg-surface-secondary text-muted hover:text-foreground border border-divider/60 transition-all cursor-pointer"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Right section: Notifications + UserDropdown */}
      <div className="flex items-center gap-4">
        <button
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-primary hover:bg-surface-secondary text-muted hover:text-foreground border border-divider/60 transition-all cursor-pointer"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>
        <UserDropdown userEmail={userEmail} isHr={isHr} />
      </div>
    </header>
  );
}
