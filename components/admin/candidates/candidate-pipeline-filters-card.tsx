"use client";

import type { CalendarDate } from "@internationalized/date";
import type { Key } from "@heroui/react";
import { memo, type Dispatch, type SetStateAction } from "react";
import {
  Button,
  DateField,
  DateRangePicker,
  Label,
  ListBox,
  RangeCalendar,
  Select,
} from "@heroui/react";
import type { RangeValue } from "react-aria-components";
import { Dialog } from "react-aria-components";
import { DataTableToolbar } from "@/components/admin/shell/table-system";
import { Calendar } from "lucide-react";

const MONTH_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Apr" },
  { value: 5, label: "May" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Aug" },
  { value: 9, label: "Sep" },
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" },
];

const YEAR_OPTIONS = Array.from(
  { length: 2030 - 1990 + 1 },
  (_, i) => 1990 + i,
);

export type CandidatePipelineFilterOption = {
  id: string;
  label: string;
};

export type CandidatePipelineFiltersCardProps = {
  query: string;
  setQuery: (value: string) => void;
  searchPlaceholder?: string;
  statusKey?: Key | null;
  setStatusKey?: (key: Key | null) => void;
  statusFilterOptions?: CandidatePipelineFilterOption[];
  jdFilterKey?: Key | null;
  setJdFilterKey?: (key: Key | null) => void;
  jdFilterOptions?: CandidatePipelineFilterOption[];
  uploadDateRangeFilter: RangeValue<CalendarDate> | null;
  setUploadDateRangeFilter: (value: RangeValue<CalendarDate> | null) => void;
  calendarFocusedDate: CalendarDate;
  setCalendarFocusedDate: Dispatch<SetStateAction<CalendarDate>>;
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
  statusKey,
  setStatusKey,
  statusFilterOptions,
  jdFilterKey,
  setJdFilterKey,
  jdFilterOptions,
  uploadDateRangeFilter,
  setUploadDateRangeFilter,
  calendarFocusedDate,
  setCalendarFocusedDate,
  onFiltersAdjusted,
  calendarIdsSuffix = "",
  onRefresh,
  isRefreshing = false,
  onCreate,
  createButtonLabel,
  createButtonDisabled = false,
}: CandidatePipelineFiltersCardProps) {
  const monthId = `candidate-calendar-month${calendarIdsSuffix}`;
  const yearId = `candidate-calendar-year${calendarIdsSuffix}`;

  const filtersElement = (
    <div className="flex items-center gap-2">
      {statusFilterOptions && setStatusKey && (
        <Select
          aria-label="Filter by status"
          value={statusKey ?? null}
          onChange={(key) => {
            setStatusKey(key);
            onFiltersAdjusted?.();
          }}
          placeholder="Filter by status"
          className="w-48"
        >
          <Select.Trigger className="w-full h-9 rounded-xl border border-divider bg-surface-secondary/40 text-xs">
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox className="p-1 border border-divider rounded-2xl bg-surface-primary shadow-xl">
              {statusFilterOptions.map((opt) => (
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
    <div className="flex items-center gap-2">
      <DateRangePicker
        aria-label="Upload date range"
        value={uploadDateRangeFilter as any}
        onChange={(next) => {
          setUploadDateRangeFilter(next as any);
          onFiltersAdjusted?.();
        }}
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
            <RangeCalendar
              focusedValue={calendarFocusedDate as any}
              onFocusChange={(next) => setCalendarFocusedDate(next as any)}
            >
              <RangeCalendar.Header className="flex items-center gap-2 mb-2 font-sans">
                <RangeCalendar.NavButton slot="previous" />
                <div className="flex flex-1 items-center gap-1">
                  <Label className="sr-only" htmlFor={monthId}>
                    Month
                  </Label>
                  <select
                    id={monthId}
                    aria-label="Month"
                    value={calendarFocusedDate.month}
                    onChange={(e) => {
                      const month = Number(e.target.value);
                      setCalendarFocusedDate((prev) =>
                        prev.set({ month, day: 1 }),
                      );
                    }}
                    className="h-7 rounded-lg border border-divider bg-surface-secondary px-1.5 text-xs font-semibold outline-none"
                  >
                    {MONTH_OPTIONS.map((month) => (
                      <option key={month.value} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </select>
                  <Label className="sr-only" htmlFor={yearId}>
                    Year
                  </Label>
                  <select
                    id={yearId}
                    aria-label="Year"
                    value={calendarFocusedDate.year}
                    onChange={(e) => {
                      const year = Number(e.target.value);
                      setCalendarFocusedDate((prev) =>
                        prev.set({ year, day: 1 }),
                      );
                    }}
                    className="h-7 rounded-lg border border-divider bg-surface-secondary px-1.5 text-xs font-semibold outline-none"
                  >
                    {YEAR_OPTIONS.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
                <RangeCalendar.NavButton slot="next" />
              </RangeCalendar.Header>
              <RangeCalendar.Grid
                weekdayStyle="short"
                className="border-collapse"
              >
                <RangeCalendar.GridHeader>
                  {(day) => (
                    <RangeCalendar.HeaderCell className="text-[10px] text-muted font-bold py-1">
                      {day}
                    </RangeCalendar.HeaderCell>
                  )}
                </RangeCalendar.GridHeader>
                <RangeCalendar.GridBody>
                  {(date) => (
                    <RangeCalendar.Cell
                      date={date}
                      className="w-8 h-8 text-center text-xs font-medium cursor-pointer relative p-0"
                    >
                      {({ formattedDate }) => (
                        <>
                          <RangeCalendar.CellIndicator className="absolute inset-0 bg-accent/10 rounded-lg" />
                          <span className="relative z-[1] flex items-center justify-center h-full w-full rounded-lg hover:bg-accent/15">
                            {formattedDate}
                          </span>
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
      {uploadDateRangeFilter ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-2.5 border border-divider rounded-xl text-xs font-semibold text-muted"
          aria-label="Clear date filter"
          onPress={() => {
            setUploadDateRangeFilter(null);
            onFiltersAdjusted?.();
          }}
        >
          Clear
        </Button>
      ) : null}
    </div>
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
