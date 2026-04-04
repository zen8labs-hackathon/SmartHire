"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@heroui/react";

const mainItems = [
  { href: "/admin", label: "Users" },
  { href: "/admin/jd", label: "Jobs list" },
  { href: "/admin/candidates", label: "CV management" },
] as const;

const setupItems = [
  { href: "/admin/chapters", label: "Chapters" },
  { href: "/admin/evaluation-template", label: "Evaluation template" },
] as const;

function linkActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function setupSectionActive(pathname: string): boolean {
  return setupItems.some((i) => linkActive(pathname, i.href));
}

const linkClass = (active: boolean, nested?: boolean) =>
  cn(
    "block rounded-xl py-2 text-sm font-medium transition-colors",
    nested ? "pl-5 pr-3" : "px-3",
    active
      ? "bg-surface-tertiary text-foreground"
      : "text-muted hover:bg-surface-secondary hover:text-foreground",
  );

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      className={cn(
        "h-4 w-4 shrink-0 text-muted transition-transform duration-200",
        open && "rotate-180",
      )}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function AdminSidebarNav({ isHr }: { isHr: boolean }) {
  const pathname = usePathname();
  const visibleMain = isHr
    ? mainItems
    : mainItems.filter((i) => i.href === "/admin/jd");

  const setupActive = isHr && setupSectionActive(pathname);
  const [setupOpen, setSetupOpen] = useState(setupActive);

  useEffect(() => {
    if (setupActive) setSetupOpen(true);
  }, [setupActive]);

  return (
    <nav aria-label="Admin" className="flex flex-col gap-1">
      {visibleMain.map(({ href, label }) => {
        const active = linkActive(pathname, href);
        return (
          <Link key={href} href={href} className={linkClass(active)}>
            <span suppressHydrationWarning>{label}</span>
          </Link>
        );
      })}

      {isHr ? (
        <div className="mt-3 border-t border-divider pt-3">
          <button
            type="button"
            id="admin-nav-setup-heading"
            className={cn(
              "flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition-colors",
              setupActive
                ? "text-foreground"
                : "text-muted hover:bg-surface-secondary hover:text-foreground",
              setupOpen && setupActive && "bg-surface-tertiary/60",
            )}
            aria-expanded={setupOpen}
            aria-controls="admin-setup-submenu"
            onClick={() => setSetupOpen((o) => !o)}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              Setup
            </span>
            <ChevronIcon open={setupOpen} />
          </button>

          {setupOpen ? (
            <ul
              id="admin-setup-submenu"
              className="mt-1 flex list-none flex-col gap-1 border-l border-divider pl-2"
              aria-labelledby="admin-nav-setup-heading"
            >
              {setupItems.map(({ href, label }) => {
                const active = linkActive(pathname, href);
                return (
                  <li key={href}>
                    <Link href={href} className={linkClass(active, true)}>
                      <span suppressHydrationWarning>{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}
