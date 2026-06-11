import React from "react";
import {
  Card,
  DateField,
  DateRangePicker,
  Label,
  ListBox,
  RangeCalendar,
  SearchField,
  Select,
  Button,
} from "@heroui/react";
import { Dialog } from "react-aria-components";
import { JD_STATUS_OPTIONS } from "@/lib/jd/types";
import { useJdDashboard } from "./context";

export function JdFilters() {
  const {
    jdListSearch,
    setJdListSearch,
    jdListStatusKey,
    setJdListStatusKey,
    jdStartDateRange,
    setJdStartDateRange,
  } = useJdDashboard();

  return (
    <Card variant="secondary">
      <Card.Content className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
          <SearchField
            value={jdListSearch}
            onChange={setJdListSearch}
            className="min-w-[220px] flex-1"
          >
            <SearchField.Group className="w-full">
              <SearchField.SearchIcon />
              <SearchField.Input
                placeholder="Search by job title / position…"
                className="w-full min-w-0"
              />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <Select
            value={jdListStatusKey}
            onChange={(key) => {
              if (typeof key === "string") setJdListStatusKey(key);
            }}
            className="min-w-[200px]"
          >
            <Label className="sr-only">Status</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="all" textValue="All statuses">
                  All statuses
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                {JD_STATUS_OPTIONS.map((s) => (
                  <ListBox.Item key={s} id={s} textValue={s}>
                    {s}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1 min-w-[min(100%,280px)] max-w-md flex-1">
              <Label className="text-xs text-muted" id="jd-start-range-label">
                Start date range
              </Label>
              <DateRangePicker
                aria-labelledby="jd-start-range-label"
                value={jdStartDateRange as any}
                onChange={(val) => setJdStartDateRange(val as any)}
                className="w-full"
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
                    <RangeCalendar>
                      <RangeCalendar.Header>
                        <RangeCalendar.NavButton slot="previous" />
                        <RangeCalendar.Heading />
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
            </div>
            {jdStartDateRange ? (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onPress={() => setJdStartDateRange(null)}
              >
                Clear dates
              </Button>
            ) : null}
          </div>
        </div>
      </Card.Content>
    </Card>
  );
}
export default JdFilters;
