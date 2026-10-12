"use client";

import React from "react";
import {
  Button,
  Card,
  cn,
  Input,
  Modal,
  Pagination as HeroUIPagination,
  Spinner,
} from "@heroui/react";
import {
  Search,
  RotateCw,
  Plus,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";

// ==========================================
// 1. TOOLBAR
// ==========================================

export type DataTableToolbarProps = {
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  dateRange?: React.ReactNode;
  onRefresh?: () => void | Promise<void>;
  isRefreshing?: boolean;
  createButtonLabel?: string;
  onCreate?: () => void;
  createButtonDisabled?: boolean;
  /** Extra buttons rendered alongside refresh/create, e.g. page-specific actions. */
  actions?: React.ReactNode;
};

export function DataTableToolbar({
  searchQuery = "",
  onSearchChange,
  searchPlaceholder = "Search...",
  filters,
  dateRange,
  onRefresh,
  isRefreshing = false,
  createButtonLabel,
  onCreate,
  createButtonDisabled = false,
  actions,
}: DataTableToolbarProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {onSearchChange && (
        <div className="relative w-80 shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-full rounded-md border border-border-field bg-surface pl-8 pr-3 text-body text-foreground outline-none transition-colors duration-[120ms] ease-standard placeholder:text-field-placeholder hover:border-neutral-500 focus:border-accent focus:shadow-[0_0_0_1px_var(--accent)]"
          />
        </div>
      )}

      {filters && <div className="flex items-center gap-2">{filters}</div>}

      {dateRange && <div className="flex items-center gap-2">{dateRange}</div>}

      {onRefresh && (
        <Button
          isIconOnly
          variant="ghost"
          className="h-9 w-9 shrink-0 rounded-lg border border-border-field bg-surface text-muted hover:bg-surface-subtle"
          onPress={onRefresh}
          aria-label="Refresh list"
          isDisabled={isRefreshing}
        >
          <RotateCw
            className={`h-4 w-4 ${isRefreshing ? "animate-spin text-accent" : ""}`}
          />
        </Button>
      )}

      {actions}

      {createButtonLabel && onCreate && (
        <Button
          variant="primary"
          onPress={onCreate}
          isDisabled={createButtonDisabled}
          className="h-9 gap-1.5 px-3.5"
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span>{createButtonLabel}</span>
        </Button>
      )}
    </div>
  );
}

// ==========================================
// 1b. FILTER MODAL (sub-field filters, opened from the toolbar)
// ==========================================

export type DataTableFilterButtonProps = {
  onPress: () => void;
  /** Number of non-default sub-field filters currently applied. */
  activeCount?: number;
  label?: string;
};

export function DataTableFilterButton({
  onPress,
  activeCount = 0,
  label = "Filters",
}: DataTableFilterButtonProps) {
  return (
    <Button
      variant="secondary"
      onPress={onPress}
      className="h-9 gap-1.5 px-3"
    >
      <SlidersHorizontal className="h-4 w-4" />
      <span>{label}</span>
      {activeCount > 0 && (
        <span className="ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-overline font-semibold tabular-nums text-accent-foreground">
          {activeCount}
        </span>
      )}
    </Button>
  );
}

export type DataTableFilterModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  onClear?: () => void;
  children: React.ReactNode;
};

export function DataTableFilterModal({
  isOpen,
  onOpenChange,
  title = "Filters",
  onClear,
  children,
}: DataTableFilterModalProps) {
  return (
    <Modal.Backdrop
      className="bg-[var(--backdrop)]"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    >
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-md overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-divider px-5 py-4">
            <Modal.Heading>{title}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-4 px-5 py-4">
            {children}
          </Modal.Body>
          <Modal.Footer className="justify-between gap-2 border-t border-divider px-5 py-3">
            {onClear ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-danger"
                onPress={onClear}
              >
                Clear all
              </Button>
            ) : (
              <span />
            )}
            <Button
              variant="primary"
              size="sm"
              onPress={() => onOpenChange(false)}
            >
              Done
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

// ==========================================
// 2. PAGINATION
// ==========================================

export type DataTablePaginationProps = {
  page: number;
  totalPages: number;
  setPage: (page: number) => void;
  startIdx: number;
  endIdx: number;
  totalCount: number;
  itemTypeLabel?: string;
  pageSize?: number;
  setPageSize?: (size: number) => void;
};

/** Page numbers with first/last always visible and ellipsis gaps when needed. */
function getPaginationItems(
  page: number,
  totalPages: number,
): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const items: (number | "ellipsis")[] = [1];

  if (page > 3) {
    items.push("ellipsis");
  }

  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  for (let i = start; i <= end; i++) {
    items.push(i);
  }

  if (page < totalPages - 2) {
    items.push("ellipsis");
  }

  items.push(totalPages);
  return items;
}

export function DataTablePagination({
  page,
  totalPages,
  setPage,
  startIdx,
  endIdx,
  totalCount,
  itemTypeLabel = "items",
  pageSize,
  setPageSize,
}: DataTablePaginationProps) {
  const pages = getPaginationItems(page, totalPages);

  return (
    <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-caption tabular-nums text-muted">
          Showing{" "}
          <span className="font-medium text-foreground">{startIdx}</span> to{" "}
          <span className="font-medium text-foreground">{endIdx}</span> of{" "}
          <span className="font-medium text-foreground">{totalCount}</span>{" "}
          {itemTypeLabel}
        </p>

        {setPageSize && pageSize !== undefined && (
          <div className="flex items-center gap-1.5 text-caption text-muted">
            <span>Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
              }}
              className="h-7 cursor-pointer rounded-md border border-border-field bg-surface px-1.5 text-caption tabular-nums text-foreground outline-none transition-colors hover:border-neutral-500 focus:border-accent"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-1">
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            isDisabled={page <= 1}
            onPress={() => setPage(Math.max(1, page - 1))}
            className="h-8 w-8 rounded-lg border border-divider hover:bg-surface-secondary text-muted"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {pages.map((p, i) =>
            p === "ellipsis" ? (
              <span
                key={`ellipsis-${i}`}
                className="flex h-8 w-8 items-center justify-center text-table text-muted"
                aria-hidden
              >
                …
              </span>
            ) : (
              <Button
                key={p}
                variant={p === page ? "primary" : "ghost"}
                size="sm"
                onPress={() => setPage(p)}
                aria-current={p === page ? "page" : undefined}
                className={`h-8 min-w-8 rounded-md px-1 text-table tabular-nums ${
                  p === page
                    ? "font-semibold"
                    : "font-medium text-fg-2 hover:bg-surface-hover"
                }`}
              >
                {p}
              </Button>
            ),
          )}

          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            isDisabled={page >= totalPages}
            onPress={() => setPage(Math.min(totalPages, page + 1))}
            className="h-8 w-8 rounded-lg border border-divider hover:bg-surface-secondary text-muted"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </nav>
      )}
    </div>
  );
}

// ==========================================
// 3. STATS PANEL
// ==========================================

export type TableStatItem = {
  label: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
  /** Makes the card a toggle button (e.g. "filter the table by this stat"); omit for a plain, non-interactive card. */
  onClick?: () => void;
  /** Highlights the card as the currently-applied filter. Only meaningful alongside `onClick`. */
  isActive?: boolean;
};

export type DataTableStatsProps = {
  stats: TableStatItem[];
};

export function DataTableStats({ stats }: DataTableStatsProps) {
  const gridCols =
    stats.length <= 2
      ? "grid-cols-1 sm:grid-cols-2"
      : stats.length === 3
        ? "grid-cols-1 sm:grid-cols-3"
        : "grid-cols-2 md:grid-cols-4";

  return (
    <div className={`mb-3 grid gap-3 ${gridCols}`}>
      {stats.map((stat, idx) => {
        const clickable = !!stat.onClick;
        return (
          <Card
            key={idx}
            variant="secondary"
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            aria-pressed={clickable ? !!stat.isActive : undefined}
            onClick={stat.onClick}
            onKeyDown={
              clickable
                ? (e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      stat.onClick?.();
                    }
                  }
                : undefined
            }
            className={cn(
              "gap-0 rounded-lg border border-divider bg-surface p-4 shadow-none",
              clickable &&
                "cursor-pointer text-left transition-colors duration-[120ms] ease-standard hover:border-border-strong",
              stat.isActive && "border-accent bg-surface-selected hover:border-accent",
            )}
          >
            <div className="flex items-center justify-between gap-3 text-muted">
              <span className="text-caption font-medium">
                {stat.label}
              </span>
              {stat.icon && (
                <div className="shrink-0 text-muted [&_svg]:h-4 [&_svg]:w-4">{stat.icon}</div>
              )}
            </div>
            <p className="mt-1.5 text-kpi font-semibold tabular-nums text-foreground">
              {stat.value}
            </p>
            {stat.description && (
              <p className="mt-1 text-caption text-muted">
                {stat.description}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ==========================================
// 4. LOADING SKELETON
// ==========================================

export type DataTableSkeletonProps = {
  columnsCount?: number;
  rowsCount?: number;
};

export function DataTableSkeleton({
  columnsCount = 5,
  rowsCount = 5,
}: DataTableSkeletonProps) {
  return (
    <div className="space-y-4">
      {/* Stats Skeleton */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <Card
            key={idx}
            variant="secondary"
            className="animate-pulse gap-0 rounded-lg border border-divider bg-surface p-4 shadow-none"
          >
            <div className="h-3 w-16 rounded-sm bg-surface-skeleton" />
            <div className="mt-3 h-6 w-12 rounded-sm bg-surface-skeleton" />
            <div className="mt-2 h-3 w-24 rounded-sm bg-surface-skeleton" />
          </Card>
        ))}
      </div>

      {/* Toolbar Skeleton */}
      <div className="flex animate-pulse flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="h-9 w-64 rounded-md bg-surface-skeleton" />
        <div className="h-9 w-28 rounded-lg bg-surface-skeleton" />
      </div>

      {/* Table Skeleton */}
      <Card
        variant="secondary"
        className="animate-pulse gap-0 overflow-hidden rounded-lg border border-divider bg-surface p-0 shadow-none"
      >
        <div className="flex h-9 items-center border-b border-divider bg-surface-subtle px-3">
          <div className="h-3 w-32 rounded-sm bg-surface-skeleton" />
        </div>
        <div className="divide-y divide-divider">
          {Array.from({ length: rowsCount }).map((_, rIdx) => (
            <div key={rIdx} className="flex h-12 items-center gap-3 px-3">
              <div className="h-7 w-7 shrink-0 rounded-full bg-surface-skeleton" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-1/3 rounded-sm bg-surface-skeleton" />
                <div className="h-2.5 w-1/4 rounded-sm bg-surface-skeleton" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
