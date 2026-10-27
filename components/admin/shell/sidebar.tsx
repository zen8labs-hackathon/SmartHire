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
  Heart,
  UserCheck,
  CalendarDays,
  ArrowRightLeft,
  LogOut,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { buildMenu, isNavActive, type NavIcon } from "@/lib/nav/menu";
import Image from "next/image";

export type SidebarProps = {
  userEmail: string;
  isHr: boolean;
  chapterIds: string[];
  isChapterHead?: boolean;
  collapsed?: boolean;
};

export function Sidebar({
  userEmail,
  isHr,
  isChapterHead = false,
  collapsed = false,
}: SidebarProps) {
  const pathname = usePathname();
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [isPendingSignOut, startSignOutTransition] = useTransition();

  const handleSignOut = () => {
    startSignOutTransition(async () => {
      await signOut();
    });
  };

  const ICONS: Record<NavIcon, LucideIcon> = {
    dashboard: LayoutDashboard,
    stats: BarChart2,
    positions: Briefcase,
    candidates: FileText,
    talent: Heart,
    pipelines: Layers,
    probation: UserCheck,
    users: Users,
    chapters: Compass,
    templates: FileSpreadsheet,
    calendar: CalendarDays,
    migration: ArrowRightLeft,
  };
  const menu = buildMenu({ isHr, isChapterHead });

  const roleText = isHr ? "HR" : isChapterHead ? "Chapter Head" : "Recruiter";

  // Initials for avatar
  const displayName = userEmail.split("@")[0];
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col overflow-hidden border-r border-divider bg-[#F6F8F7] font-sans transition-[width] duration-[180ms] ease-standard",
        collapsed ? "w-16 px-2" : "w-[248px] px-3",
      )}
    >
      {/* Header / Logo */}
      <Link
        href="/dashboard"
        className={cn(
          "flex h-14 shrink-0 items-center gap-2.5 rounded-md",
          collapsed ? "justify-center px-0" : "px-2",
        )}
      >
        <Image
          src="/logo.svg"
          className="h-7 w-7 shrink-0"
          alt="Logo"
          width={28}
          height={28}
        />
        {!collapsed && (
          <span className="whitespace-nowrap text-section font-bold tracking-tight text-heading">
            Smart Hire
          </span>
        )}
      </Link>

      {/* Main Navigation */}
      <nav
        aria-label="Main"
        className="flex flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden pl-3 pt-2 -ml-3"
      >
        {menu.map((group) => (
          <div key={group.id} className="flex flex-col gap-0.5">
            {collapsed ? (
              <div className="mx-2 mb-1 h-px bg-divider" />
            ) : (
              <p className="sh-nav-label">{group.label}</p>
            )}
            {group.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isNavActive(item.href, pathname);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={cn("sh-nav-link", collapsed && "justify-center px-0")}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  aria-label={collapsed ? item.label : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom Profile Bar */}
      <div
        className={cn(
          "mt-auto flex items-center gap-2 border-t border-divider py-3",
          collapsed && "flex-col",
        )}
      >
        <button
          onClick={() => setProfileModalOpen(true)}
          aria-label="Profile settings"
          title={collapsed ? displayName : undefined}
          className={cn(
            "flex min-w-0 cursor-pointer items-center gap-2.5 rounded-md p-1 text-left transition-colors hover:bg-surface-hover",
            collapsed ? "justify-center" : "flex-1",
          )}
        >
          <span className="sh-avatar h-8 w-8 text-caption">{initials}</span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-table font-semibold text-foreground">
                  {displayName}
                </span>
                <span
                  className={cn(
                    "sh-chip h-[18px] shrink-0 px-1.5 text-[11px]",
                    isHr ? "sh-chip--brand" : "sh-chip--neutral",
                  )}
                >
                  {roleText}
                </span>
              </div>
              <p className="truncate text-caption text-muted">{userEmail}</p>
            </div>
          )}
        </button>
        <button
          onClick={handleSignOut}
          disabled={isPendingSignOut}
          aria-label="Logout"
          title="Log out"
          className="sh-iconbtn shrink-0 hover:!text-danger disabled:opacity-50"
        >
          {isPendingSignOut ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
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
