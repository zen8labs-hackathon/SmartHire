"use client";

import { useEffect, useState } from "react";

/**
 * Returns a copy of `value` that only updates after `delayMs` of no further
 * changes. Used to gate network-triggering effects (e.g. search-driven
 * fetches) behind a pause in typing, while the input itself stays bound to
 * the immediate value.
 */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
