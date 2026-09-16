import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { today } from "@internationalized/date";
import type { CalendarDate } from "@internationalized/date";
import type { RangeValue } from "react-aria-components";
import { usePageQueryParam } from "@/components/admin/shell/use-page-query-param";
import {
  dateRangeQueryParam,
  intQueryParam,
  stringQueryParam,
  useQueryParamState,
} from "@/components/admin/shell/use-query-param-state";
import { useDebouncedValue } from "@/components/admin/shell/use-debounced-value";

/**
 * UTC-based "last 3 months" default, matching `defaultJdStartDateRangeIso`
 * (`lib/jd/list-with-enrichment.ts`) used for the server-side initial fetch,
 * so the first paint doesn't need an immediate client refetch to stay in sync.
 */
function defaultStartDateRange(): RangeValue<CalendarDate> {
  const end = today("UTC");
  const start = end.subtract({ months: 3 });
  return { start, end };
}

/**
 * Owns the JD list's search/status/date-range filter state and page number.
 * Filtering/pagination itself now happens server-side (see
 * `use-jd-list-state.ts`) — this hook only owns the inputs to that query.
 */
export function useJdFiltersState() {
  const searchParams = useSearchParams();
  // The server-rendered initial page (app/admin/jd/page.tsx) always fetches
  // with the hardcoded last-3-months default, ignoring the URL -- so if the
  // page was reached with filters already in the URL (e.g. browser back from
  // a JD's pipeline page), that initial data won't match them and the first
  // client-side fetch below must not be skipped. Captured once at mount;
  // later filter changes always go through the normal "value changed" path.
  const [hasUrlFiltersOnMount] = useState(() =>
    ["q", "status", "startDate", "page", "pageSize"].some((key) =>
      searchParams.has(key),
    ),
  );
  const [page, setPage] = usePageQueryParam();
  const skipInitialPageResetRef = useRef(true);

  // Filters/page are mirrored into the URL (see use-query-param-state) so a
  // browser back from a JD's pipeline page lands back on the same
  // filtered/paged JD list instead of resetting to defaults.
  const [urlJdListSearch, setUrlJdListSearch] = useQueryParamState(
    "q",
    "",
    stringQueryParam,
  );
  // Kept as separate local state so the input stays lag-free while typing;
  // only the debounced value is written back to the URL/used to fetch.
  const [jdListSearch, setJdListSearch] = useState(urlJdListSearch);
  const debouncedJdListSearch = useDebouncedValue(jdListSearch, 350);
  useEffect(() => {
    setUrlJdListSearch(debouncedJdListSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedJdListSearch]);

  const [jdListStatusKey, setJdListStatusKey] = useQueryParamState(
    "status",
    "all",
    stringQueryParam,
  );
  // Stable reference so an untouched date filter doesn't look like a new
  // value on every render -- `use-jd-list-state.ts`'s refetch effect keys
  // off this object by reference.
  const defaultDateRange = useMemo(() => defaultStartDateRange(), []);
  const [jdStartDateRange, setJdStartDateRange] = useQueryParamState<
    RangeValue<CalendarDate> | null
  >("startDate", defaultDateRange, dateRangeQueryParam);
  const [pageSize, setPageSize] = useQueryParamState(
    "pageSize",
    10,
    intQueryParam(10),
  );

  useEffect(() => {
    if (skipInitialPageResetRef.current) {
      skipInitialPageResetRef.current = false;
      return;
    }
    setPage(1);
  }, [debouncedJdListSearch, jdListStatusKey, jdStartDateRange, pageSize]);

  return {
    hasUrlFiltersOnMount,
    page,
    setPage,
    jdListSearch,
    setJdListSearch,
    debouncedJdListSearch,
    jdListStatusKey,
    setJdListStatusKey,
    jdStartDateRange,
    setJdStartDateRange,
    pageSize,
    setPageSize,
  };
}
