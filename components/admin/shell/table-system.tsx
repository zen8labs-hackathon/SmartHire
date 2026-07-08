"use client";

import React from "react";
import {
  Button,
  Card,
  Input,
  Modal,
  Pagination as HeroUIPagination,
  Spinner
} from "@heroui/react";
import { Search, RotateCw, Plus, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";

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
    <div className="flex flex-col gap-3.5 pb-4.5 border-b border-divider/60 mb-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-3">
        {onSearchChange && (
          <div className="relative min-w-[280px] flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/70" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-10 pr-4 py-2 text-sm bg-surface-secondary/40 border border-divider hover:border-accent/40 focus:border-accent focus:bg-background rounded-xl outline-none transition-all placeholder:text-muted/60"
            />
          </div>
        )}
        
        {filters && (
          <div className="flex items-center gap-2">
            {filters}
          </div>
        )}

        {dateRange && (
          <div className="flex items-center gap-2">
            {dateRange}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5 shrink-0 justify-end mt-1 lg:mt-0">
        {actions}

        {onRefresh && (
          <Button
            isIconOnly
            variant="ghost"
            className="h-9 w-9 rounded-xl border border-divider hover:bg-surface-secondary"
            onPress={onRefresh}
            aria-label="Refresh list"
            isDisabled={isRefreshing}
          >
            <RotateCw className={`h-4 w-4 text-muted hover:text-foreground transition-all duration-300 ${isRefreshing ? "animate-spin text-accent" : ""}`} />
          </Button>
        )}

        {createButtonLabel && onCreate && (
          <Button
            variant="primary"
            onPress={onCreate}
            isDisabled={createButtonDisabled}
            className="py-2 px-4 rounded-xl bg-accent hover:bg-accent/90 text-white font-semibold shadow-md transition-all flex items-center gap-1.5 cursor-pointer text-xs sm:text-sm"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>{createButtonLabel}</span>
          </Button>
        )}
      </div>
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
      variant="ghost"
      onPress={onPress}
      className="h-9 gap-1.5 rounded-xl border border-divider bg-surface-secondary/40 px-3 text-xs font-semibold text-foreground hover:bg-surface-secondary"
    >
      <SlidersHorizontal className="h-3.5 w-3.5" />
      <span>{label}</span>
      {activeCount > 0 && (
        <span className="ml-0.5 inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
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
      className="bg-black/40 backdrop-blur-sm"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    >
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-md overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-divider px-6 py-5">
            <Modal.Heading>{title}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-4 px-6 py-5">
            {children}
          </Modal.Body>
          <Modal.Footer className="justify-between gap-2 border-t border-divider px-6 py-4">
            {onClear ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs font-semibold text-muted"
                onPress={onClear}
              >
                Clear all
              </Button>
            ) : (
              <span />
            )}
            <Button variant="primary" size="sm" onPress={() => onOpenChange(false)}>
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
  // Page window helper
  const width = 3;
  let start = Math.max(1, page - Math.floor(width / 2));
  const end = Math.min(totalPages, start + width - 1);
  start = Math.max(1, end - width + 1);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between py-4 border-t border-divider/60 font-sans">
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-xs text-muted font-medium">
          Showing <span className="font-semibold text-foreground">{startIdx}</span> to{" "}
          <span className="font-semibold text-foreground">{endIdx}</span> of{" "}
          <span className="font-semibold text-foreground">{totalCount}</span> {itemTypeLabel}
        </p>

        {setPageSize && pageSize !== undefined && (
          <div className="flex items-center gap-1.5 text-xs text-muted font-medium">
            <span>Show:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
              }}
              className="h-7 rounded-lg border border-divider bg-surface-secondary/40 hover:bg-surface-secondary px-1.5 text-[11px] font-semibold outline-none cursor-pointer transition-colors focus:border-accent text-foreground"
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
        <nav aria-label="Pagination" className="flex items-center space-x-1">
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

          {pages.map((p) => (
            <Button
              key={p}
              variant={p === page ? "primary" : "ghost"}
              size="sm"
              onPress={() => setPage(p)}
              className={`h-8 w-8 rounded-lg text-xs font-semibold ${
                p === page
                  ? "bg-accent text-white shadow-sm"
                  : "border border-divider/40 hover:bg-surface-secondary text-muted"
              }`}
            >
              {p}
            </Button>
          ))}

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
};

export type DataTableStatsProps = {
  stats: TableStatItem[];
};

export function DataTableStats({ stats }: DataTableStatsProps) {
  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-4 mb-3">
      {stats.map((stat, idx) => (
        <Card
          key={idx}
          variant="secondary"
          className="border border-divider/60 bg-surface-secondary/20 p-4.5 rounded-2xl shadow-sm"
        >
          <div className="flex items-center justify-between gap-3 text-muted">
            <span className="text-[10px] font-bold uppercase tracking-wider">
              {stat.label}
            </span>
            {stat.icon && <div className="shrink-0 opacity-70">{stat.icon}</div>}
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {stat.value}
          </p>
          {stat.description && (
            <p className="mt-1 text-[10px] text-muted font-medium">
              {stat.description}
            </p>
          )}
        </Card>
      ))}
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
    <div className="space-y-6 font-sans">
      {/* Stats Skeleton */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <Card key={idx} variant="secondary" className="border border-divider animate-pulse p-4.5 rounded-2xl">
            <div className="h-3 w-16 bg-default-200 rounded" />
            <div className="h-6 w-12 bg-default-300 rounded mt-3.5" />
            <div className="h-3.5 w-24 bg-default-100 rounded mt-1.5" />
          </Card>
        ))}
      </div>

      {/* Toolbar Skeleton */}
      <div className="flex flex-col gap-4.5 pb-4 border-b border-divider animate-pulse lg:flex-row lg:items-center lg:justify-between">
        <div className="h-9 w-64 bg-default-200 rounded-xl" />
        <div className="h-9 w-28 bg-default-300 rounded-xl" />
      </div>

      {/* Table Skeleton */}
      <Card variant="secondary" className="border border-divider animate-pulse p-0 rounded-2xl overflow-hidden">
        <div className="border-b border-divider bg-surface-secondary/40 p-4.5">
          <div className="h-4.5 w-32 bg-default-200 rounded" />
        </div>
        <div className="p-4.5 space-y-4">
          {Array.from({ length: rowsCount }).map((_, rIdx) => (
            <div key={rIdx} className="flex gap-4">
              <div className="h-10 w-10 bg-default-200 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2 mt-1">
                <div className="h-4.5 w-1/3 bg-default-300 rounded" />
                <div className="h-3.5 w-1/4 bg-default-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
