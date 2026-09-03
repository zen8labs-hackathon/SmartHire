"use client";

import { useEffect, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import {
  today,
  getLocalTimeZone,
  parseDate,
  type CalendarDate,
} from "@internationalized/date";
import { Button, Calendar, DateField, DatePicker, Label } from "@heroui/react";
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
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from(
  { length: CURRENT_YEAR - 1940 + 1 },
  (_, i) => CURRENT_YEAR - i,
);

/** Parses a stored `YYYY-MM-DD` string into a `CalendarDate`, tolerating junk. */
function toCalendarDate(value: string): CalendarDate | null {
  if (!value) return null;
  try {
    return parseDate(value.slice(0, 10));
  } catch {
    return null;
  }
}

export type DatePickerFieldProps = {
  /** Stored as an ISO `YYYY-MM-DD` string (or `""` when unset). */
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  isDisabled?: boolean;
  isInvalid?: boolean;
  /** Disambiguates the month/year `<select>` ids when several mount at once. */
  idSuffix?: string;
  className?: string;
};

/**
 * Single-date field (input segments + popover calendar) built on the same
 * HeroUI `DatePicker` + `Calendar` composition as {@link DateRangeCalendarField},
 * with month/year `<select>` navigation for reaching far-back dates like a
 * date of birth in a couple of clicks.
 */
export function DatePickerField({
  value,
  onChange,
  ariaLabel,
  isDisabled,
  isInvalid,
  idSuffix = "",
  className = "w-full",
}: DatePickerFieldProps) {
  const selected = toCalendarDate(value);
  const [focusedDate, setFocusedDate] = useState<CalendarDate>(
    () => toCalendarDate(value) ?? today(getLocalTimeZone()),
  );

  // Keyed on the raw `value` string (stable across renders) -- keying on the
  // derived `CalendarDate` would loop forever since `toCalendarDate` returns a
  // fresh instance every render.
  useEffect(() => {
    const next = toCalendarDate(value);
    if (next) setFocusedDate((prev) => (prev.compare(next) === 0 ? prev : next));
  }, [value]);

  return (
    <DatePicker
      aria-label={ariaLabel}
      value={(selected as any) ?? null}
      onChange={(next) =>
        onChange(next ? (next as CalendarDate).toString() : "")
      }
      isDisabled={isDisabled}
      isInvalid={isInvalid}
      className={className}
    >
      <DateField.Group
        fullWidth
        variant="primary"
        className="h-10 rounded-xl border-divider bg-surface-secondary/40 px-2 text-sm text-foreground shadow-sm"
      >
        <DateField.InputContainer className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto [scrollbar-width:none]">
          <DateField.Input className="outline-none">
            {(segment) => <DateField.Segment segment={segment} />}
          </DateField.Input>
        </DateField.InputContainer>
        <DateField.Suffix>
          <DatePicker.Trigger className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted outline-none hover:bg-surface-tertiary">
            <CalendarIcon className="size-3.5" />
          </DatePicker.Trigger>
        </DateField.Suffix>
      </DateField.Group>
      <DatePicker.Popover>
        <Dialog className="z-50 rounded-2xl border border-divider bg-surface-primary p-4 shadow-2xl outline-none">
          <Calendar
            focusedValue={focusedDate as any}
            onFocusChange={(next) => setFocusedDate(next as any)}
          >
            <Calendar.Header className="mb-2 flex items-center justify-between gap-2">
              <Calendar.NavButton slot="previous" />
              <div className="flex flex-1 items-center justify-center gap-1">
                <Label className="sr-only" htmlFor={`dob-month${idSuffix}`}>
                  Month
                </Label>
                <select
                  id={`dob-month${idSuffix}`}
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
                <Label className="sr-only" htmlFor={`dob-year${idSuffix}`}>
                  Year
                </Label>
                <select
                  id={`dob-year${idSuffix}`}
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
              <Calendar.NavButton slot="next" />
            </Calendar.Header>
            <Calendar.Grid weekdayStyle="short" className="border-collapse">
              <Calendar.GridHeader>
                {(day) => (
                  <Calendar.HeaderCell className="py-1 text-[10px] font-bold text-muted">
                    {day}
                  </Calendar.HeaderCell>
                )}
              </Calendar.GridHeader>
              <Calendar.GridBody>
                {(date) => (
                  <Calendar.Cell
                    date={date}
                    className="relative size-8 cursor-pointer p-0 text-center text-xs font-medium"
                  >
                    {({ formattedDate }) => (
                      <>
                        <Calendar.CellIndicator className="absolute inset-0 rounded-lg bg-accent/10" />
                        <span className="relative z-[1] flex size-full items-center justify-center rounded-lg hover:bg-accent/15">
                          {formattedDate}
                        </span>
                      </>
                    )}
                  </Calendar.Cell>
                )}
              </Calendar.GridBody>
            </Calendar.Grid>
          </Calendar>
          {selected ? (
            <div className="mt-2 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-lg px-2 text-xs font-semibold text-muted"
                onPress={() => onChange("")}
              >
                Clear
              </Button>
            </div>
          ) : null}
        </Dialog>
      </DatePicker.Popover>
    </DatePicker>
  );
}
