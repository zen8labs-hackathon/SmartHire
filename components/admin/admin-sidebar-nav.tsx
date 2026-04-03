"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@heroui/react";

const items = [
  { href: "/admin", label: "Users" },
  { href: "/admin/jd", label: "Job descriptions" },
] as const;

export function AdminSidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="flex flex-col gap-1">
      {items.map(({ href, label }) => {
        const active =
          href === "/admin"
            ? pathname === "/admin"
            : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-surface-tertiary text-foreground"
                : "text-muted hover:bg-surface-secondary hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
