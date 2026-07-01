"use client";

import type { CalendarDate } from "@internationalized/date";
import type { Key } from "@heroui/react";
import type { Dispatch, SetStateAction } from "react";
import {
  Button,
  Card,
  DateField,
  DateRangePicker,
  Label,
  ListBox,
  RangeCalendar,
  SearchField,
  Select,
} from "@heroui/react";
import type { RangeValue } from "react-aria-components";
import { Dialog } from "react-aria-components";

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

const YEAR_OPTIONS = Array.from({ length: 2030 - 1990 + 1 }, (_, i) => 1990 + i);

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
};

export function CandidatePipelineFiltersCard({
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
}: CandidatePipelineFiltersCardProps) {
  const monthId = `candidate-calendar-month${calendarIdsSuffix}`;
  const yearId = `candidate-calendar-year${calendarIdsSuffix}`;

  return (
    <Card variant="secondary" className="overflow-hidden">
      <Card.Content className="gap-4 p-4">
        <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <SearchField
              value={query}
              onChange={setQuery}
              className="min-w-[280px] flex-1"
            >
              <SearchField.Group className="w-full">
                <SearchField.SearchIcon />
                <SearchField.Input
                  placeholder={searchPlaceholder}
                  className="w-full min-w-0"
                />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>

            {statusFilterOptions && setStatusKey ? (
              <Select
                value={statusKey ?? null}
                onChange={(key) => {
                  setStatusKey(key);
                  onFiltersAdjusted?.();
                }}
              >
                <Label className="sr-only">Status</Label>
                <Select.Trigger className="min-w-[160px]">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {statusFilterOptions.map((opt) => (
                      <ListBox.Item key={opt.id} id={opt.id} textValue={opt.label}>
                        {opt.label}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            ) : null}

            {jdFilterOptions && setJdFilterKey ? (
              <Select
                value={jdFilterKey ?? null}
                onChange={(key) => {
                  setJdFilterKey(key);
                  onFiltersAdjusted?.();
                }}
              >
                <Label className="sr-only">Job description</Label>
                <Select.Trigger className="min-w-[200px]">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {jdFilterOptions.map((opt) => (
                      <ListBox.Item key={opt.id} id={opt.id} textValue={opt.label}>
                        {opt.label}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            ) : null}
          </div>

          <div className="ml-auto flex shrink-0 flex-col gap-1 self-end">
            <Label className="block text-left text-xs font-medium text-muted">
              Filter by date range
            </Label>
            <div className="flex items-center gap-2">
              <DateRangePicker
                value={uploadDateRangeFilter as any}
                onChange={(next) => {
                  setUploadDateRangeFilter(next as any);
                  onFiltersAdjusted?.();
                }}
                className="w-full min-w-[16rem]"
              >
                <DateField.Group
                  fullWidth
                  variant="primary"
                  className="border-neutral-200 bg-white text-neutral-950 shadow-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
                >
                  <DateField.InputContainer className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto [scrollbar-width:none]">
                    <DateField.Input slot="start">
                      {(segment) => <DateField.Segment segment={segment} />}
                    </DateField.Input>
                    <DateRangePicker.RangeSeparator className="shrink-0 px-0.5 text-neutral-500 dark:text-neutral-400" />
                    <DateField.Input slot="end">
                      {(segment) => <DateField.Segment segment={segment} />}
                    </DateField.Input>
                  </DateField.InputContainer>
                  <DateField.Suffix>
                    <DateRangePicker.Trigger className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-neutral-700 outline-none hover:bg-neutral-100 pressed:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/10 dark:pressed:bg-white/10">
                      <DateRangePicker.TriggerIndicator />
                    </DateRangePicker.Trigger>
                  </DateField.Suffix>
                </DateField.Group>
                <DateRangePicker.Popover>
                  <Dialog className="outline-none">
                    <RangeCalendar
                      focusedValue={calendarFocusedDate as any}
                      onFocusChange={(next) => setCalendarFocusedDate(next as any)}
                    >
                      <RangeCalendar.Header className="flex items-center gap-2">
                        <RangeCalendar.NavButton slot="previous" />
                        <div className="flex flex-1 items-center gap-2">
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
                            className="h-8 rounded-md border border-neutral-300 bg-background px-2 text-sm outline-none dark:border-neutral-700"
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
                            className="h-8 rounded-md border border-neutral-300 bg-background px-2 text-sm outline-none dark:border-neutral-700"
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
                      <RangeCalendar.Grid weekdayStyle="short">
                        <RangeCalendar.GridHeader>
                          {(day) => (
                            <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>
                          )}
                        </RangeCalendar.GridHeader>
                        <RangeCalendar.GridBody>
                          {(date) => (
                            <RangeCalendar.Cell date={date}>
                              {({ formattedDate }) => (
                                <>
                                  <RangeCalendar.CellIndicator />
                                  <span className="relative z-[1]">{formattedDate}</span>
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
                  className="min-w-0 px-2 font-semibold text-muted"
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
          </div>
        </div>
      </Card.Content>
    </Card>
  );
}
