"use client";

import type { CalendarDate } from "@internationalized/date";
import type { Key } from "@heroui/react";
import { memo } from "react";
import { ListBox, Select } from "@heroui/react";
import type { RangeValue } from "react-aria-components";
import { DataTableToolbar } from "@/components/admin/shell/table-system";
import { DateRangeCalendarField } from "@/components/admin/shell/date-range-calendar-field";

export type CandidatePipelineFilterOption = {
  id: string;
  label: string;
};

export type CandidatePipelineFiltersCardProps = {
  query: string;
  setQuery: (value: string) => void;
  searchPlaceholder?: string;
  jdFilterKey?: Key | null;
  setJdFilterKey?: (key: Key | null) => void;
  jdFilterOptions?: CandidatePipelineFilterOption[];
  uploadDateRangeFilter: RangeValue<CalendarDate> | null;
  setUploadDateRangeFilter: (value: RangeValue<CalendarDate> | null) => void;
  /** Called after any filter control changes (e.g. reset table page). */
  onFiltersAdjusted?: () => void;
  /** Unique suffix for month/year select ids when multiple instances mount. */
  calendarIdsSuffix?: string;
  // Added refresh and create callbacks to hook into reusable toolbar
  onRefresh?: () => void | Promise<void>;
  isRefreshing?: boolean;
  onCreate?: () => void;
  createButtonLabel?: string;
  createButtonDisabled?: boolean;
};

function CandidatePipelineFiltersCardImpl({
  query,
  setQuery,
  searchPlaceholder = "Search by name, role, skill, source, JD, or match…",
  jdFilterKey,
  setJdFilterKey,
  jdFilterOptions,
  uploadDateRangeFilter,
  setUploadDateRangeFilter,
  onFiltersAdjusted,
  calendarIdsSuffix = "",
  onRefresh,
  isRefreshing = false,
  onCreate,
  createButtonLabel,
  createButtonDisabled = false,
}: CandidatePipelineFiltersCardProps) {
  const filtersElement = (
    <div className="flex items-center gap-2">
      {jdFilterOptions && setJdFilterKey && (
        <Select
          aria-label="Filter by Job"
          value={jdFilterKey ?? null}
          onChange={(key) => {
            setJdFilterKey(key);
            onFiltersAdjusted?.();
          }}
          placeholder="Filter by Job"
          className="w-52"
        >
          <Select.Trigger className="w-full h-9 rounded-xl border border-divider bg-surface-secondary/40 text-xs">
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox className="p-1 border border-divider rounded-2xl bg-surface-primary shadow-xl">
              {jdFilterOptions.map((opt) => (
                <ListBox.Item
                  key={opt.id}
                  id={opt.id}
                  textValue={opt.label}
                  className="text-xs font-semibold py-1.5 px-2.5 rounded-lg hover:bg-surface-secondary cursor-pointer"
                >
                  {opt.label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      )}
    </div>
  );

  const dateRangeElement = (
    <DateRangeCalendarField
      ariaLabel="Upload date range"
      value={uploadDateRangeFilter}
      onChange={(next) => {
        setUploadDateRangeFilter(next);
        onFiltersAdjusted?.();
      }}
      className="w-full"
      dateFieldClassName="border-divider bg-surface-secondary/40 text-foreground shadow-sm h-9 rounded-xl py-1 px-3 text-xs"
      monthYearNav
      idSuffix={`-candidate${calendarIdsSuffix}`}
    />
  );

  return (
    <DataTableToolbar
      searchQuery={query}
      onSearchChange={setQuery}
      searchPlaceholder={searchPlaceholder}
      filters={filtersElement}
      dateRange={dateRangeElement}
      onRefresh={onRefresh}
      isRefreshing={isRefreshing}
      createButtonLabel={createButtonLabel}
      onCreate={onCreate}
      createButtonDisabled={createButtonDisabled}
    />
  );
}

export const CandidatePipelineFiltersCard = memo(
  CandidatePipelineFiltersCardImpl,
);
