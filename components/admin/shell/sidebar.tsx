"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@heroui/react";
import { UserModal } from "./user-modal";
import {
  LayoutDashboard,
  Users,
  FileText,
  Briefcase,
  Layers,
  Compass,
  FileSpreadsheet,
  Settings,
  ChevronDown
} from "lucide-react";

export type SidebarProps = {
  userEmail: string;
  isHr: boolean;
  workChapter: string | null;
  chapterIds: string[];
};

export function Sidebar({ userEmail, isHr, workChapter, chapterIds }: SidebarProps) {
  const pathname = usePathname();
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(true);

  // Helper to check if link is active
  const isLinkActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/admin") return pathname === "/admin";
    if (href === "/admin/candidates") return pathname === "/admin/candidates" || pathname.startsWith("/admin/candidates/");
    if (href === "/admin/jd") return pathname === "/admin/jd" || pathname.startsWith("/admin/jd/");
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const navLinkClass = (active: boolean) =>
    cn(
      "flex items-center gap-2.5 rounded-xl py-2 px-3 text-sm font-medium transition-all duration-150 cursor-pointer",
      active
        ? "bg-accent/10 text-accent dark:bg-accent/15"
        : "text-muted hover:bg-surface-secondary hover:text-foreground"
    );

  const roleText = isHr ? "HR" : "Recruiter";

  // Initials for avatar
  const displayName = userEmail.split("@")[0];
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-divider bg-surface-primary px-4 py-5 font-sans h-full">
      {/* Header / Logo */}
      <Link
        href="/dashboard"
        className="flex items-center gap-2.5 px-3 py-1 mb-6 focus:outline-none"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-accent to-indigo-500 text-white shadow-sm shadow-accent/15">
          <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <span className="text-sm font-bold tracking-tight text-foreground">
          Smart Hire
        </span>
      </Link>

      {/* Main Navigation */}
      <nav className="flex-1 flex flex-col gap-5 overflow-y-auto pr-1">
        {/* Recruiting Group */}
        <div className="space-y-1">
          <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-muted/60 mb-2">
            Workspace
          </p>
          
          <Link href="/dashboard" className={navLinkClass(isLinkActive("/dashboard"))}>
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            <span>Dashboard</span>
          </Link>

          <Link href="/admin/jd" className={navLinkClass(isLinkActive("/admin/jd"))}>
            <Briefcase className="h-4 w-4 shrink-0" />
            <span>Jobs</span>
          </Link>

          {isHr && (
            <>
              <Link href="/admin/candidates" className={navLinkClass(isLinkActive("/admin/candidates"))}>
                <FileText className="h-4 w-4 shrink-0" />
                <span>Candidates</span>
              </Link>

              <Link href="/admin" className={navLinkClass(isLinkActive("/admin"))}>
                <Users className="h-4 w-4 shrink-0" />
                <span>Users</span>
              </Link>
            </>
          )}
        </div>

        {/* Setup Group (HR Only) */}
        {isHr && (
          <div className="space-y-1">
            <button
              onClick={() => setSetupOpen(!setupOpen)}
              className="flex w-full items-center justify-between px-3 text-[10px] font-bold uppercase tracking-wider text-muted/60 mb-2 hover:text-foreground transition-colors cursor-pointer"
            >
              <span>Setup</span>
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform duration-200", !setupOpen && "-rotate-90")}
              />
            </button>

            {setupOpen && (
              <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
                <Link href="/admin/pipelines" className={navLinkClass(isLinkActive("/admin/pipelines"))}>
                  <Layers className="h-4 w-4 shrink-0" />
                  <span>Pipelines</span>
                </Link>

                <Link href="/admin/chapters" className={navLinkClass(isLinkActive("/admin/chapters"))}>
                  <Compass className="h-4 w-4 shrink-0" />
                  <span>Chapters</span>
                </Link>

                <Link href="/admin/evaluation-template" className={navLinkClass(isLinkActive("/admin/evaluation-template"))}>
                  <FileSpreadsheet className="h-4 w-4 shrink-0" />
                  <span>Templates</span>
                </Link>
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Bottom Profile Bar */}
      <div className="mt-auto pt-4 border-t border-divider">
        <button
          onClick={() => setProfileModalOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-all duration-150 hover:bg-surface-secondary/60 cursor-pointer focus:outline-none"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-tertiary border border-divider text-xs font-bold text-foreground">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-foreground">
              {displayName}
            </p>
            <p className="mt-0.5 text-[10px] text-muted font-medium uppercase tracking-wider">
              {roleText}
            </p>
          </div>
          <Settings className="h-4 w-4 text-muted/70 shrink-0 hover:text-foreground" />
        </button>
      </div>

      {/* User Modal */}
      <UserModal
        open={profileModalOpen}
        onOpenChange={setProfileModalOpen}
        userEmail={userEmail}
        userRole={roleText}
      />
    </aside>
  );
}
