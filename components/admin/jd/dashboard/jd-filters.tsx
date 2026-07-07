"use client";

import React from "react";
import {
  DateField,
  DateRangePicker,
  Label,
  ListBox,
  RangeCalendar,
  Select,
  Button,
  useOverlayState,
} from "@heroui/react";
import { Dialog } from "react-aria-components";
import { JD_STATUS_OPTIONS } from "@/lib/jd/types";
import { useJdDashboard } from "./context";
import {
  DataTableFilterButton,
  DataTableFilterModal,
  DataTableToolbar,
} from "@/components/admin/shell/table-system";
import { Calendar } from "lucide-react";

export function JdFilters() {
  const {
    canManageJds,
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

  const filterModal = useOverlayState();
  const activeFilterCount =
    (jdListStatusKey !== "all" ? 1 : 0) + (jdStartDateRange ? 1 : 0);
  const clearAllFilters = () => {
    setJdListStatusKey("all");
    setJdStartDateRange(null);
  };

  const filtersElement = (
    <Select
      value={jdListStatusKey}
      onChange={(key) => {
        if (typeof key === "string") setJdListStatusKey(key);
      }}
      placeholder="All statuses"
      className="w-full"
    >
      <Label className="mb-1 block text-xs font-semibold text-muted">Status</Label>
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
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-semibold text-muted">Start date</Label>
      <div className="flex items-center gap-2">
      <DateRangePicker
        value={jdStartDateRange as any}
        onChange={(val) => setJdStartDateRange(val as any)}
        className="w-full"
      >
        <DateField.Group
          fullWidth
          variant="primary"
          className="border-divider bg-surface-secondary/40 text-foreground shadow-sm h-9 rounded-xl py-1 px-3 text-xs"
        >
          <DateField.InputContainer className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto [scrollbar-width:none]">
            <DateField.Input slot="start" className="outline-none">
              {(segment) => <DateField.Segment segment={segment} />}
            </DateField.Input>
            <DateRangePicker.RangeSeparator className="shrink-0 px-0.5 text-muted" />
            <DateField.Input slot="end" className="outline-none">
              {(segment) => <DateField.Segment segment={segment} />}
            </DateField.Input>
          </DateField.InputContainer>
          <DateField.Suffix>
            <DateRangePicker.Trigger className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted outline-none hover:bg-surface-tertiary">
              <Calendar className="h-3.5 w-3.5" />
            </DateRangePicker.Trigger>
          </DateField.Suffix>
        </DateField.Group>
        <DateRangePicker.Popover>
          <Dialog className="outline-none border border-divider rounded-2xl bg-surface-primary p-4 shadow-2xl z-50">
            <RangeCalendar>
              <RangeCalendar.Header className="flex items-center justify-between mb-2">
                <RangeCalendar.NavButton slot="previous" />
                <RangeCalendar.Heading className="text-xs font-bold" />
                <RangeCalendar.NavButton slot="next" />
              </RangeCalendar.Header>
              <RangeCalendar.Grid weekdayStyle="short" className="border-collapse">
                <RangeCalendar.GridHeader>
                  {(day) => (
                    <RangeCalendar.HeaderCell className="text-[10px] text-muted font-bold py-1">{day}</RangeCalendar.HeaderCell>
                  )}
                </RangeCalendar.GridHeader>
                <RangeCalendar.GridBody>
                  {(date) => (
                    <RangeCalendar.Cell date={date} className="w-8 h-8 text-center text-xs font-medium cursor-pointer relative p-0">
                      {({ formattedDate }) => (
                        <>
                          <RangeCalendar.CellIndicator className="absolute inset-0 bg-accent/10 rounded-lg" />
                          <span className="relative z-[1] flex items-center justify-center h-full w-full rounded-lg hover:bg-accent/15">{formattedDate}</span>
                        </>
                      )}
                    </RangeCalendar.Cell>
                  )}
                </RangeCalendar.GridBody>
              </RangeCalendar.Grid>
            </RangeCalendar>
          </Dialog>
        </DateRangePicker.Popover>
      </DateRangePicker>
      {jdStartDateRange && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-2.5 border border-divider rounded-xl text-xs font-semibold text-muted"
          onPress={() => setJdStartDateRange(null)}
        >
          Clear
        </Button>
      )}
      </div>
    </div>
  );

  return (
    <>
      <DataTableToolbar
        searchQuery={jdListSearch}
        onSearchChange={setJdListSearch}
        searchPlaceholder="Search by job title or position..."
        filters={
          <DataTableFilterButton
            onPress={filterModal.open}
            activeCount={activeFilterCount}
          />
        }
        onRefresh={loadDescriptions}
        isRefreshing={loading}
        createButtonLabel={canManageJds ? "New Position" : undefined}
        onCreate={canManageJds ? jdModal.open : undefined}
      />
      <DataTableFilterModal
        isOpen={filterModal.isOpen}
        onOpenChange={filterModal.setOpen}
        onClear={activeFilterCount > 0 ? clearAllFilters : undefined}
      >
        {filtersElement}
        {dateRangeElement}
      </DataTableFilterModal>
    </>
  );
}

export default JdFilters;
