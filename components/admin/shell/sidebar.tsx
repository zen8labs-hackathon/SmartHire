"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@heroui/react";
import { UserModal } from "./user-modal";
import { signOut } from "@/app/auth/actions";
import {
  LayoutDashboard,
  Users,
  FileText,
  Briefcase,
  Layers,
  Compass,
  FileSpreadsheet,
  BarChart2,
  ChevronDown,
  LogOut,
  Loader2,
} from "lucide-react";
import Image from "next/image";

export type SidebarProps = {
  userEmail: string;
  isHr: boolean;
  chapterIds: string[];
  collapsed?: boolean;
};

export function Sidebar({
  userEmail,
  isHr,
  chapterIds,
  collapsed = false,
}: SidebarProps) {
  const pathname = usePathname();
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(true);
  const [isPendingSignOut, startSignOutTransition] = useTransition();

  const handleSignOut = () => {
    startSignOutTransition(async () => {
      await signOut();
    });
  };

  // Helper to check if link is active
  const isLinkActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/admin") return pathname === "/admin";
    if (href === "/admin/users")
      return (
        pathname === "/admin/users" || pathname.startsWith("/admin/users/")
      );
    if (href === "/admin/candidates")
      return (
        pathname === "/admin/candidates" ||
        pathname.startsWith("/admin/candidates/")
      );
    if (href === "/admin/jd")
      return pathname === "/admin/jd" || pathname.startsWith("/admin/jd/");
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const navLinkClass = (active: boolean) =>
    cn(
      "flex items-center gap-2.5 rounded-xl py-2 px-3 text-sm font-medium transition-all duration-150 cursor-pointer",
      collapsed && "justify-center px-0",
      active
        ? "bg-accent/10 text-accent dark:bg-accent/15"
        : "text-muted hover:bg-surface-secondary hover:text-foreground",
    );

  const roleText = isHr ? "HR" : "Recruiter";

  // Initials for avatar
  const displayName = userEmail.split("@")[0];
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-divider bg-surface-primary py-5 font-sans h-full transition-all duration-200 overflow-hidden",
        collapsed ? "w-[68px] px-2" : "w-64 px-4",
      )}
    >
      {/* Header / Logo */}
      <Link
        href="/dashboard"
        className={cn(
          "flex items-center gap-2.5 py-1 mb-6 focus:outline-none",
          collapsed ? "justify-center px-0" : "px-3",
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white shadow-sm shadow-accent/15">
          <Image
            src="/logo.svg"
            className="h-5.5 w-5.5"
            alt="Logo"
            width={20}
            height={20}
          />
        </div>
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight text-foreground whitespace-nowrap">
            Smart Hire
          </span>
        )}
      </Link>

      {/* Main Navigation */}
      <nav className="flex-1 flex flex-col gap-5 overflow-y-auto overflow-x-hidden pr-1">
        {/* Recruiting Group */}
        <div className="space-y-1">
          {!collapsed && (
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-muted/60 mb-2">
              Workspace
            </p>
          )}

          <Link
            href="/dashboard"
            className={navLinkClass(isLinkActive("/dashboard"))}
            title={collapsed ? "Dashboard" : undefined}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Dashboard</span>}
          </Link>

          {isHr && (
            <Link
              href="/admin"
              className={navLinkClass(isLinkActive("/admin"))}
              title={collapsed ? "Statistic" : undefined}
            >
              <BarChart2 className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Statistic</span>}
            </Link>
          )}

          <Link
            href="/admin/jd"
            className={navLinkClass(isLinkActive("/admin/jd"))}
            title={collapsed ? "Jobs" : undefined}
          >
            <Briefcase className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Jobs</span>}
          </Link>

          {isHr && (
            <>
              <Link
                href="/admin/candidates"
                className={navLinkClass(isLinkActive("/admin/candidates"))}
                title={collapsed ? "Candidates" : undefined}
              >
                <FileText className="h-4 w-4 shrink-0" />
                {!collapsed && <span>Candidates</span>}
              </Link>

              <Link
                href="/admin/users"
                className={navLinkClass(isLinkActive("/admin/users"))}
                title={collapsed ? "Users" : undefined}
              >
                <Users className="h-4 w-4 shrink-0" />
                {!collapsed && <span>Users</span>}
              </Link>
            </>
          )}
        </div>

        {/* Setup Group (HR Only) */}
        {isHr && (
          <div className="space-y-1">
            {collapsed ? (
              <div className="h-px bg-divider mb-2" />
            ) : (
              <button
                onClick={() => setSetupOpen(!setupOpen)}
                className="flex w-full items-center justify-between px-3 text-[10px] font-bold uppercase tracking-wider text-muted/60 mb-2 hover:text-foreground transition-colors cursor-pointer"
              >
                <span>Setup</span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform duration-200",
                    !setupOpen && "-rotate-90",
                  )}
                />
              </button>
            )}

            {(collapsed || setupOpen) && (
              <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
                <Link
                  href="/admin/pipelines"
                  className={navLinkClass(isLinkActive("/admin/pipelines"))}
                  title={collapsed ? "Pipelines" : undefined}
                >
                  <Layers className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>Pipelines</span>}
                </Link>

                <Link
                  href="/admin/chapters"
                  className={navLinkClass(isLinkActive("/admin/chapters"))}
                  title={collapsed ? "Chapters" : undefined}
                >
                  <Compass className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>Chapters</span>}
                </Link>

                <Link
                  href="/admin/evaluation-template"
                  className={navLinkClass(
                    isLinkActive("/admin/evaluation-template"),
                  )}
                  title={collapsed ? "Templates" : undefined}
                >
                  <FileSpreadsheet className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>Templates</span>}
                </Link>
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Bottom Profile Bar */}
      <div className="mt-auto pt-4 border-t border-divider">
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-2xl p-2.5 bg-surface-secondary border border-divider shadow-sm",
            collapsed && "flex-col p-2",
          )}
        >
          <button
            onClick={() => setProfileModalOpen(true)}
            aria-label="Profile settings"
            title={collapsed ? displayName : undefined}
            className={cn(
              "flex min-w-0 items-center gap-3 text-left cursor-pointer focus:outline-none",
              collapsed ? "justify-center" : "flex-1",
            )}
          >
            <div className="relative shrink-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-accent to-indigo-500 text-white text-xs font-bold shadow-md shadow-accent/25">
                {initials}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 block h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-surface-secondary" />
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-bold text-foreground tracking-tight">
                    {displayName}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider",
                      isHr
                        ? "bg-rose-500/20 text-rose-700 dark:text-rose-300"
                        : "bg-accent/20 text-accent-hover",
                    )}
                  >
                    {roleText}
                  </span>
                </div>
                <p className="truncate text-[10px] text-foreground/75 mt-1 font-semibold">
                  {userEmail}
                </p>
              </div>
            )}
          </button>
          <div
            className={cn(
              "flex items-center gap-1 shrink-0",
              collapsed && "flex-col mt-2",
            )}
          >
            <button
              onClick={handleSignOut}
              disabled={isPendingSignOut}
              aria-label="Logout"
              className="shrink-0 rounded-xl p-1.5 bg-danger/10 text-danger hover:bg-danger/20 cursor-pointer focus:outline-none disabled:opacity-50 transition-all duration-150"
            >
              {isPendingSignOut ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LogOut className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
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
