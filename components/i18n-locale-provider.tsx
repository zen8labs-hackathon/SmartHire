"use client";

import { I18nProvider } from "react-aria-components";
import "@/lib/dev/suppress-a11y-label-warnings";

/**
 * Pins react-aria-components' locale to a fixed value so date/calendar
 * components render identically on the server and client. Without this,
 * locale auto-detection (navigator.language on the client vs. the server's
 * ICU default) can differ and trigger hydration mismatches in components
 * like DateRangePicker/RangeCalendar.
 */
export function I18nLocaleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <I18nProvider locale="en-US">{children}</I18nProvider>;
}
