"use client";

import React, { useId } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import { EmptyState, ErrorState } from "./empty-state";
import { BulkActionBar, ConditionChips, type Condition } from "./data-table-parts";

export type DataTableColumn<T> = {
  key: string;
  header: React.ReactNode;
  /** Plain-text header used for aria-labels (defaults to `key`). */
  headerLabel?: string;
  cell: (row: T) => React.ReactNode;
  /** CSS width, e.g. "120px". Columns are fixed-width when set. */
  width?: string;
  align?: "left" | "center" | "right";
  sortable?: boolean;
  /** Renders the cell as a <th scope="row"> — use for the primary identifier. */
  rowHeader?: boolean;
};

export type SortState = { key: string; direction: "asc" | "desc" } | null;

export type DataTablePagination = {
  page: number; // 1-based
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
};

export type DataTableProps<T> = {
  /** Accessible name — rendered as a visually hidden <caption>. */
  caption: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;

  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;

  selectable?: boolean;
  selectedIds?: ReadonlySet<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  /** Buttons shown in the bulk action bar while rows are selected. */
  bulkActions?: React.ReactNode;

  sort?: SortState;
  onSortChange?: (sort: SortState) => void;

  /** Left side of the toolbar, e.g. search + <FilterPopover/>. */
  toolbar?: React.ReactNode;
  conditions?: Condition[];
  onRemoveCondition?: (key: string) => void;
  onClearConditions?: () => void;

  onRowClick?: (row: T) => void;
  pagination?: DataTablePagination;
  /** Minimum table width before the container scrolls horizontally. */
  minWidth?: number;
  skeletonRows?: number;
};

const ALIGN = { left: "text-left", center: "text-center", right: "text-right" } as const;

/** Page numbers with ellipses, e.g. [1, "…", 4, 5, 6, "…", 12]. */
export function getPaginationItems(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const items: (number | "…")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) items.push("…");
  for (let p = start; p <= end; p++) items.push(p);
  if (end < totalPages - 1) items.push("…");
  items.push(totalPages);
  return items;
}

export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  pageSizeOptions = [10, 20, 50],
  onPageSizeChange,
}: DataTablePagination) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(total, safePage * pageSize);
  const selectId = useId();

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-divider px-3 py-2 text-caption text-muted"
    >
      <span aria-live="polite">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-3">
        {onPageSizeChange ? (
          <label htmlFor={selectId} className="flex items-center gap-1.5">
            Rows
            <select
              id={selectId}
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-8 rounded-md border border-divider bg-surface px-2 text-caption text-foreground"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <ul className="flex items-center gap-1">
          <li>
            <button
              type="button"
              className="sh-iconbtn sh-iconbtn--sm"
              aria-label="Previous page"
              title="Previous page"
              disabled={safePage <= 1}
              onClick={() => onPageChange(safePage - 1)}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
          </li>
          {getPaginationItems(safePage, totalPages).map((item, i) => (
            <li key={`${item}-${i}`}>
              {item === "…" ? (
                <span className="px-1" aria-hidden>
                  …
                </span>
              ) : (
                <button
                  type="button"
                  className={`sh-iconbtn sh-iconbtn--sm tabular-nums ${item === safePage ? "sh-iconbtn--active" : ""}`}
                  aria-label={`Page ${item}`}
                  aria-current={item === safePage ? "page" : undefined}
                  onClick={() => onPageChange(item)}
                >
                  {item}
                </button>
              )}
            </li>
          ))}
          <li>
            <button
              type="button"
              className="sh-iconbtn sh-iconbtn--sm"
              aria-label="Next page"
              title="Next page"
              disabled={safePage >= totalPages}
              onClick={() => onPageChange(safePage + 1)}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}

function nextSort(current: SortState, key: string): SortState {
  if (!current || current.key !== key) return { key, direction: "asc" };
  if (current.direction === "asc") return { key, direction: "desc" };
  return null;
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowId,
  loading = false,
  error = null,
  onRetry,
  emptyTitle = "No results",
  emptyDescription,
  emptyAction,
  selectable = false,
  selectedIds,
  onSelectionChange,
  bulkActions,
  sort = null,
  onSortChange,
  toolbar,
  conditions = [],
  onRemoveCondition,
  onClearConditions,
  onRowClick,
  pagination,
  minWidth = 720,
  skeletonRows = 5,
}: DataTableProps<T>) {
  const selected = selectedIds ?? new Set<string>();
  const ids = rows.map(getRowId);
  const selectedOnPage = ids.filter((id) => selected.has(id)).length;
  const allSelected = ids.length > 0 && selectedOnPage === ids.length;
  const someSelected = selectedOnPage > 0 && !allSelected;
  const colCount = columns.length + (selectable ? 1 : 0);

  const headCheckRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (headCheckRef.current) headCheckRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) ids.forEach((id) => next.delete(id));
    else ids.forEach((id) => next.add(id));
    onSelectionChange?.(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange?.(next);
  };

  const hasToolbar = Boolean(toolbar) || conditions.length > 0;
  const showEmpty = !loading && !error && rows.length === 0;

  return (
    <div className="overflow-hidden rounded-lg border border-divider bg-surface">
      {hasToolbar ? (
        <div className="flex flex-col gap-2 border-b border-divider px-3 py-2">
          {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
          {onRemoveCondition && onClearConditions ? (
            <ConditionChips
              conditions={conditions}
              onRemove={onRemoveCondition}
              onClearAll={onClearConditions}
            />
          ) : null}
        </div>
      ) : null}

      {selectable ? (
        <BulkActionBar count={selected.size} onClear={() => onSelectionChange?.(new Set())}>
          {bulkActions}
        </BulkActionBar>
      ) : null}

      {error ? (
        <ErrorState
          title="Couldn't load data"
          description={error}
          action={
            onRetry ? (
              <button type="button" className="sh-btn sh-btn--secondary" onClick={onRetry}>
                Retry
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table
            className="w-full table-fixed border-collapse text-table"
            style={{ minWidth }}
            aria-busy={loading || undefined}
          >
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr className="h-9 border-b border-divider bg-surface-subtle">
                {selectable ? (
                  <th scope="col" className="w-10 px-3 text-left">
                    <input
                      ref={headCheckRef}
                      type="checkbox"
                      aria-label="Select all rows on this page"
                      checked={allSelected}
                      disabled={loading || ids.length === 0}
                      onChange={toggleAll}
                      className="h-4 w-4 accent-[#075F32]"
                    />
                  </th>
                ) : null}
                {columns.map((col) => {
                  const active = sort?.key === col.key ? sort : null;
                  const ariaSort = col.sortable
                    ? active
                      ? active.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                    : undefined;
                  const SortIcon = !active ? ChevronsUpDown : active.direction === "asc" ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      aria-sort={ariaSort}
                      style={col.width ? { width: col.width } : undefined}
                      className={`px-3 text-caption font-semibold text-muted ${ALIGN[col.align ?? "left"]}`}
                    >
                      {col.sortable && onSortChange ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-sm hover:text-foreground"
                          onClick={() => onSortChange(nextSort(sort, col.key))}
                        >
                          {col.header}
                          <SortIcon className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: skeletonRows }).map((_, r) => (
                    <tr key={r} className="h-12 border-b border-divider last:border-b-0" aria-hidden>
                      {Array.from({ length: colCount }).map((__, c) => (
                        <td key={c} className="px-3">
                          <div className="h-3 w-3/4 animate-pulse rounded-sm bg-surface-skeleton" />
                        </td>
                      ))}
                    </tr>
                  ))
                : rows.map((row) => {
                    const id = getRowId(row);
                    const isSelected = selected.has(id);
                    return (
                      <tr
                        key={id}
                        aria-selected={selectable ? isSelected : undefined}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                        className={`h-12 border-b border-divider last:border-b-0 ${
                          isSelected ? "bg-surface-subtle" : "hover:bg-surface-subtle"
                        } ${onRowClick ? "cursor-pointer" : ""}`}
                      >
                        {selectable ? (
                          <td className="px-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={`Select row ${id}`}
                              checked={isSelected}
                              onChange={() => toggleOne(id)}
                              className="h-4 w-4 accent-[#075F32]"
                            />
                          </td>
                        ) : null}
                        {columns.map((col) => {
                          const Tag = col.rowHeader ? "th" : "td";
                          return (
                            <Tag
                              key={col.key}
                              scope={col.rowHeader ? "row" : undefined}
                              className={`truncate px-3 font-normal text-foreground ${ALIGN[col.align ?? "left"]}`}
                            >
                              {col.cell(row)}
                            </Tag>
                          );
                        })}
                      </tr>
                    );
                  })}
            </tbody>
          </table>
          {showEmpty ? (
            <EmptyState
              title={conditions.length > 0 ? "No results match these filters" : emptyTitle}
              description={emptyDescription}
              action={emptyAction}
            />
          ) : null}
        </div>
      )}

      {pagination && !error && !showEmpty ? <TablePagination {...pagination} /> : null}
    </div>
  );
}
