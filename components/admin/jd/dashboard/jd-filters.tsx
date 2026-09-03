"use client";

import React from "react";
import { ListBox, Select } from "@heroui/react";
import { JD_STATUS_OPTIONS } from "@/lib/jd/types";
import { useJdDashboard } from "./context";
import { DataTableToolbar } from "@/components/admin/shell/table-system";
import { DateRangeCalendarField } from "@/components/admin/shell/date-range-calendar-field";

export function JdFilters() {
  const {
    canManageJds,
    canAdministerJds,
    loading,
    loadDescriptions,
    jdModal,
    jdListSearch,
    setJdListSearch,
    jdListStatusKey,
    setJdListStatusKey,
    jdStartDateRange,
    setJdStartDateRange,
  } = useJdDashboard();

  const filtersElement = (
    <Select
      value={jdListStatusKey}
      onChange={(key) => {
        if (typeof key === "string") setJdListStatusKey(key);
      }}
      placeholder="All statuses"
      className="w-40"
    >
      <Select.Trigger className="w-full h-9 rounded-xl border border-divider bg-surface-secondary/40 text-xs">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox className="p-1 border border-divider rounded-2xl bg-surface-primary shadow-xl">
          <ListBox.Item id="all" textValue="All statuses" className="text-xs font-semibold py-1.5 px-2.5 rounded-lg hover:bg-surface-secondary cursor-pointer">
            All statuses
            <ListBox.ItemIndicator />
          </ListBox.Item>
          {JD_STATUS_OPTIONS.map((s) => (
            <ListBox.Item key={s} id={s} textValue={s} className="text-xs font-semibold py-1.5 px-2.5 rounded-lg hover:bg-surface-secondary cursor-pointer">
              {s}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );

  const dateRangeElement = (
    <DateRangeCalendarField
      value={jdStartDateRange}
      onChange={setJdStartDateRange}
      className="w-full"
      dateFieldClassName="border-divider bg-surface-secondary/40 text-foreground shadow-sm h-9 rounded-xl py-1 px-3 text-xs"
    />
  );

  return (
    <DataTableToolbar
      searchQuery={jdListSearch}
      onSearchChange={setJdListSearch}
      searchPlaceholder="Search by job title or position..."
      filters={filtersElement}
      dateRange={dateRangeElement}
      onRefresh={loadDescriptions}
      isRefreshing={loading}
      createButtonLabel={canAdministerJds ? "New Position" : undefined}
      onCreate={canAdministerJds ? jdModal.open : undefined}
    />
  );
}

export default JdFilters;
