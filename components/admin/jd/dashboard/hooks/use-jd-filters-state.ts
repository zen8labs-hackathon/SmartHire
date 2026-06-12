import { useState, useMemo, useEffect } from "react";
import type { CalendarDate } from "@internationalized/date";
import type { RangeValue } from "react-aria-components";
import type { JobDescription } from "@/lib/jd/types";

const ROWS_PER_PAGE = 10;

export function useJdFiltersState(rows: JobDescription[]) {
  const [page, setPage] = useState(1);
  const [jdListSearch, setJdListSearch] = useState("");
  const [jdListStatusKey, setJdListStatusKey] = useState<string>("all");
  const [jdStartDateRange, setJdStartDateRange] =
    useState<RangeValue<CalendarDate> | null>(null);

  const filteredRows = useMemo(() => {
    const q = jdListSearch.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.position.toLowerCase().includes(q)) return false;
      if (jdListStatusKey !== "all" && r.status !== jdListStatusKey) {
        return false;
      }
      if (jdStartDateRange) {
        const d = r.start_date;
        if (!d) return false;
        const from = jdStartDateRange.start.toString();
        const to = jdStartDateRange.end.toString();
        if (d < from || d > to) return false;
      }
      return true;
    });
  }, [rows, jdListSearch, jdListStatusKey, jdStartDateRange]);

  useEffect(() => {
    setPage(1);
  }, [jdListSearch, jdListStatusKey, jdStartDateRange]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);

  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * ROWS_PER_PAGE;
    return filteredRows.slice(start, start + ROWS_PER_PAGE);
  }, [filteredRows, safePage]);

  const startIdx = filteredRows.length === 0 ? 0 : (safePage - 1) * ROWS_PER_PAGE + 1;
  const endIdx = Math.min(safePage * ROWS_PER_PAGE, filteredRows.length);

  return {
    page,
    setPage,
    jdListSearch,
    setJdListSearch,
    jdListStatusKey,
    setJdListStatusKey,
    jdStartDateRange,
    setJdStartDateRange,
    filteredRows,
    totalPages,
    safePage,
    paginatedRows,
    startIdx,
    endIdx,
  };
}
