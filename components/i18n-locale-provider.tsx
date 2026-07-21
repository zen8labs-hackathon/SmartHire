"use client";

import { I18nProvider } from "react-aria-components";
import { DISPLAY_DATE_LOCALE } from "@/lib/format-date";
import "@/lib/dev/suppress-a11y-label-warnings";

/**
 * Pins react-aria-components' locale to a fixed value so date/calendar
 * components render identically on the server and client. Without this,
 * locale auto-detection (navigator.language on the client vs. the server's
 * ICU default) can differ and trigger hydration mismatches in components
 * like DateRangePicker/RangeCalendar.
 *
 * `en-ZA` keeps English calendar labels while using yyyy/mm/dd segment order
 * (matching {@link formatDisplayDate}).
 */
export function I18nLocaleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <I18nProvider locale={DISPLAY_DATE_LOCALE}>{children}</I18nProvider>
  );
}
