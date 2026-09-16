"use client";

import { parseDate, type CalendarDate } from "@internationalized/date";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import type { RangeValue } from "react-aria-components";

export type QueryParamCodec<T> = {
  parse: (raw: string) => T;
  serialize: (value: T) => string;
};

export const stringQueryParam: QueryParamCodec<string> = {
  parse: (raw) => raw,
  serialize: (value) => value,
};

export function intQueryParam(fallback: number): QueryParamCodec<number> {
  return {
    parse: (raw) => {
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    },
    serialize: (value) => String(value),
  };
}

/** `start_end` (ISO `YYYY-MM-DD` on each side) <-> a calendar date range, or
 * `null` when the filter is unset. */
export const dateRangeQueryParam: QueryParamCodec<
  RangeValue<CalendarDate> | null
> = {
  parse: (raw) => {
    const [startStr, endStr] = raw.split("_");
    if (!startStr || !endStr) throw new Error("Invalid date range param");
    return { start: parseDate(startStr), end: parseDate(endStr) };
  },
  serialize: (value) =>
    value ? `${value.start.toString()}_${value.end.toString()}` : "",
};

/** `column:direction` <-> a table sort descriptor, or `null` when unsorted.
 * `columns` whitelists the parseable column values (mirroring the server's
 * own whitelist) so a hand-edited/stale URL can't sort by an arbitrary
 * string. */
export function sortDescriptorQueryParam<C extends string>(
  columns: readonly C[],
): QueryParamCodec<{
  column: C;
  direction: "ascending" | "descending";
} | null> {
  return {
    parse: (raw) => {
      const [column, direction] = raw.split(":");
      if (!column || !columns.includes(column as C)) {
        throw new Error("Invalid sort column");
      }
      if (direction !== "ascending" && direction !== "descending") {
        throw new Error("Invalid sort direction");
      }
      return { column: column as C, direction };
    },
    serialize: (value) => (value ? `${value.column}:${value.direction}` : ""),
  };
}

/**
 * Syncs one piece of table filter/sort/pagination state to a URL query
 * param so refresh, browser back/forward, and shared links preserve it --
 * same pattern as `usePageQueryParam` (the `?page=` case) generalized to
 * any value with a string codec. The param is omitted from the URL
 * whenever the value serializes to the same string as `defaultValue`
 * (keeping default-state URLs clean), and dropped entirely if it fails to
 * parse (e.g. a hand-edited/stale URL) instead of throwing.
 */
export function useQueryParamState<T>(
  key: string,
  defaultValue: T,
  codec: QueryParamCodec<T>,
): [T, (next: T) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get(key);

  const value = useMemo(() => {
    if (raw == null) return defaultValue;
    try {
      return codec.parse(raw);
    } catch {
      return defaultValue;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, defaultValue]);

  const setValue = useCallback(
    (next: T) => {
      const currentQuery = searchParams.toString();
      const params = new URLSearchParams(currentQuery);
      const serialized = codec.serialize(next);
      if (serialized === codec.serialize(defaultValue)) {
        params.delete(key);
      } else {
        params.set(key, serialized);
      }
      const query = params.toString();
      if (query === currentQuery) return;
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, defaultValue, pathname, router, searchParams],
  );

  return [value, setValue];
}
