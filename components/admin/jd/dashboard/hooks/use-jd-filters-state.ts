import { useState, useEffect, useRef } from "react";
import { today } from "@internationalized/date";
import type { CalendarDate } from "@internationalized/date";
import type { RangeValue } from "react-aria-components";
import { usePageQueryParam } from "@/components/admin/shell/use-page-query-param";
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
  const [page, setPage] = usePageQueryParam();
  const skipInitialPageResetRef = useRef(true);
  const [jdListSearch, setJdListSearch] = useState("");
  const debouncedJdListSearch = useDebouncedValue(jdListSearch, 350);
  const [jdListStatusKey, setJdListStatusKey] = useState<string>("all");
  const [jdStartDateRange, setJdStartDateRange] =
    useState<RangeValue<CalendarDate> | null>(defaultStartDateRange);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    if (skipInitialPageResetRef.current) {
      skipInitialPageResetRef.current = false;
      return;
    }
    setPage(1);
  }, [debouncedJdListSearch, jdListStatusKey, jdStartDateRange, pageSize]);

  return {
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
