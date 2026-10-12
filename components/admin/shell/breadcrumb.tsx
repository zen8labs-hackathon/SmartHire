"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export type BreadcrumbProps = {
  items: BreadcrumbItem[];
};

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center space-x-1.5 text-caption text-muted">
      <Link
        href="/dashboard"
        className="flex items-center gap-1 hover:text-foreground transition-colors duration-[120ms] py-1"
      >
        <Home className="h-3.5 w-3.5" />
      </Link>
      
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        
        return (
          <div key={index} className="flex items-center space-x-1.5">
            <ChevronRight className="h-3 w-3 shrink-0 text-muted" />
            {isLast || !item.href ? (
              <span className="font-medium text-fg-2 py-1 truncate max-w-[160px] sm:max-w-[280px]">
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="hover:text-foreground transition-colors duration-[120ms] py-1 truncate max-w-[160px] sm:max-w-[280px]"
              >
                {item.label}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
