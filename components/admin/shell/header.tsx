"use client";

import { UserDropdown } from "./user-dropdown";
import { Bell } from "lucide-react";

export type HeaderProps = {
  userEmail: string;
  isHr: boolean;
};

export function Header({ userEmail, isHr }: HeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-divider bg-surface-primary px-6 font-sans">
      {/* Left section: Optional spacing or quick actions */}
      <div className="flex items-center gap-4">
        {/* Can be used for side-drawer toggle on mobile */}
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
