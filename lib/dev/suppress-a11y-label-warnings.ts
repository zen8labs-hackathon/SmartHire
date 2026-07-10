"use client";

/**
 * react-aria-components emits a dev-only console warning/error whenever a
 * form control (Select, DateRangePicker, NumberField, ColorSlider, ...) has
 * no visible label and no aria-label/aria-labelledby. We label every control
 * we build deliberately, but noisy false positives from popover-nested
 * fields still show up during local dev — filter just that message here.
 * Production builds already strip these warnings, so this is a no-op there.
 */
const SUPPRESSED_PATTERNS = [/aria-label or aria-labelledby/i];

function shouldSuppress(args: unknown[]): boolean {
  const first = args[0];
  return (
    typeof first === "string" &&
    SUPPRESSED_PATTERNS.some((pattern) => pattern.test(first))
  );
}

type PatchableConsole = typeof console & {
  __a11yLabelWarningsSuppressed?: boolean;
};

if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  const patchableConsole = console as PatchableConsole;
  if (!patchableConsole.__a11yLabelWarningsSuppressed) {
    patchableConsole.__a11yLabelWarningsSuppressed = true;
    const originalWarn = console.warn.bind(console);
    const originalError = console.error.bind(console);

    console.warn = (...args: unknown[]) => {
      if (shouldSuppress(args)) return;
      originalWarn(...args);
    };
    console.error = (...args: unknown[]) => {
      if (shouldSuppress(args)) return;
      originalError(...args);
    };
  }
}
