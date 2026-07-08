"use client";

import { useState } from "react";
import { useTransition } from "react";
import { UserModal } from "./user-modal";
import { signOut } from "@/app/auth/actions";
import { LogOut, Settings, User } from "lucide-react";
import { cn } from "@heroui/react";

export type UserDropdownProps = {
  userEmail: string;
  isHr: boolean;
};

export function UserDropdown({ userEmail, isHr }: UserDropdownProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [isPendingSignOut, startSignOutTransition] = useTransition();

  const displayName = userEmail.split("@")[0];
  const initials = displayName.slice(0, 2).toUpperCase();
  const roleText = isHr ? "HR" : "Recruiter";

  const handleSignOut = () => {
    startSignOutTransition(async () => {
      await signOut();
    });
  };

  return (
    <div className="relative font-sans">
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-tertiary border border-divider text-xs font-bold text-foreground cursor-pointer focus:outline-none hover:bg-surface-secondary transition-all"
      >
        {initials}
      </button>

      {dropdownOpen && (
        <>
          <div
            onClick={() => setDropdownOpen(false)}
            className="fixed inset-0 z-40 bg-transparent"
          />
          <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-2xl border border-divider bg-surface-primary p-1.5 shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="px-3 py-2 border-b border-divider/60">
              <p className="text-xs font-bold text-foreground truncate">{displayName}</p>
              <p className="text-[10px] font-semibold text-muted truncate mt-0.5">{userEmail}</p>
              <span className="inline-flex mt-1.5 items-center rounded-full bg-accent/10 px-2 py-0.5 text-[9px] font-bold text-accent uppercase tracking-wider">
                {roleText}
              </span>
            </div>
            
            <div className="py-1">
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  setModalOpen(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-foreground hover:bg-surface-secondary rounded-xl transition-colors cursor-pointer"
              >
                <User className="h-4 w-4 text-muted shrink-0" />
                <span>Profile Settings</span>
              </button>
              
              <button
                onClick={handleSignOut}
                disabled={isPendingSignOut}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-danger hover:bg-danger/10 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                <LogOut className="h-4 w-4 text-danger shrink-0" />
                <span>{isPendingSignOut ? "Logging out..." : "Logout"}</span>
              </button>
            </div>
          </div>
        </>
      )}

      <UserModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        userEmail={userEmail}
        userRole={roleText}
      />
    </div>
  );
}
