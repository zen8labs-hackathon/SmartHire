"use client";

import { useEffect, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import {
  today,
  getLocalTimeZone,
  type CalendarDate,
} from "@internationalized/date";
import {
  Button,
  DateField,
  DateRangePicker,
  Label,
  RangeCalendar,
} from "@heroui/react";
import { Dialog } from "react-aria-components";
import type { RangeValue } from "react-aria-components";

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

export type DateRangeCalendarFieldProps = {
  value: RangeValue<CalendarDate> | null;
  onChange: (value: RangeValue<CalendarDate> | null) => void;
  ariaLabel?: string;
  /** Wrapper `DateRangePicker` width/sizing. */
  className?: string;
  /** `DateField.Group` sizing/typography -- varies between compact toolbar filters and form fields. */
  dateFieldClassName?: string;
  /** Swaps the default `RangeCalendar.Heading` for month/year `<select>` dropdowns. */
  monthYearNav?: boolean;
  /** Renders a "Clear" button next to the picker when `value` is set. */
  allowClear?: boolean;
  isInvalid?: boolean;
  /** Disambiguates month/year `<select>` element ids when multiple instances mount at once. */
  idSuffix?: string;
};

/**
 * Range date picker (input segments + popover calendar) shared by the JD,
 * candidate, and job-pipeline filter toolbars, plus the JD create form.
 * `monthYearNav`/`allowClear`/`dateFieldClassName` cover the presentation
 * differences between those call sites; the underlying HeroUI composition
 * (`DateRangePicker` + `RangeCalendar`) is otherwise identical everywhere.
 */
export function DateRangeCalendarField({
  value,
  onChange,
  ariaLabel,
  className = "w-72",
  dateFieldClassName = "border-divider bg-surface-secondary/40 text-foreground shadow-sm h-9 rounded-xl py-1 px-1 text-xs",
  monthYearNav = false,
  allowClear = true,
  isInvalid,
  idSuffix = "",
}: DateRangeCalendarFieldProps) {
  const [focusedDate, setFocusedDate] = useState<CalendarDate>(() =>
    today(getLocalTimeZone()),
  );

  useEffect(() => {
    if (value?.start) setFocusedDate(value.start);
  }, [value]);

  return (
    <div className="flex items-center gap-2">
      <DateRangePicker
        aria-label={ariaLabel}
        value={value as any}
        onChange={(next) => onChange(next as any)}
        isInvalid={isInvalid}
        className={className}
      >
        <DateField.Group
          fullWidth
          variant="primary"
          className={dateFieldClassName}
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
              <CalendarIcon className="h-3.5 w-3.5" />
            </DateRangePicker.Trigger>
          </DateField.Suffix>
        </DateField.Group>
        <DateRangePicker.Popover>
          <Dialog className="outline-none border border-divider rounded-2xl bg-surface-primary p-4 shadow-2xl z-50">
            <RangeCalendar
              focusedValue={focusedDate as any}
              onFocusChange={(next) => setFocusedDate(next as any)}
            >
              <RangeCalendar.Header className="flex items-center justify-between mb-2 gap-2">
                <RangeCalendar.NavButton slot="previous" />
                {monthYearNav ? (
                  <div className="flex flex-1 items-center gap-1 justify-center">
                    <Label className="sr-only" htmlFor={`cal-month${idSuffix}`}>
                      Month
                    </Label>
                    <select
                      id={`cal-month${idSuffix}`}
                      aria-label="Month"
                      value={focusedDate.month}
                      onChange={(e) =>
                        setFocusedDate((p) =>
                          p.set({ month: Number(e.target.value), day: 1 }),
                        )
                      }
                      className="h-7 rounded-lg border border-divider bg-surface-secondary px-1 text-[11px] font-semibold outline-none"
                    >
                      {MONTH_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <Label className="sr-only" htmlFor={`cal-year${idSuffix}`}>
                      Year
                    </Label>
                    <select
                      id={`cal-year${idSuffix}`}
                      aria-label="Year"
                      value={focusedDate.year}
                      onChange={(e) =>
                        setFocusedDate((p) =>
                          p.set({ year: Number(e.target.value), day: 1 }),
                        )
                      }
                      className="h-7 rounded-lg border border-divider bg-surface-secondary px-1 text-[11px] font-semibold outline-none"
                    >
                      {YEAR_OPTIONS.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <RangeCalendar.Heading className="text-xs font-bold" />
                )}
                <RangeCalendar.NavButton slot="next" />
              </RangeCalendar.Header>
              <RangeCalendar.Grid weekdayStyle="short" className="border-collapse">
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
      {allowClear && value ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-2.5 border border-divider rounded-xl text-xs font-semibold text-muted"
          aria-label="Clear date filter"
          onPress={() => onChange(null)}
        >
          Clear
        </Button>
      ) : null}
    </div>
  );
}
