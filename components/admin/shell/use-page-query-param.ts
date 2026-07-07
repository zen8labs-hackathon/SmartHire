"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * Keeps a table's current page number in sync with the `?page=` query
 * string so refresh, browser back/forward, and shared links preserve it.
 * `page` is derived from the URL on every render (single source of truth);
 * `setPage` replaces the URL without adding a history entry or scrolling.
 * Page 1 is represented by the absence of the `page` param.
 */
export function usePageQueryParam() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawPage = searchParams.get("page");
  const parsedPage = rawPage ? Number.parseInt(rawPage, 10) : 1;
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const setPage = useCallback(
    (nextPage: number) => {
      const currentQuery = searchParams.toString();
      const params = new URLSearchParams(currentQuery);
      if (nextPage <= 1) {
        params.delete("page");
      } else {
        params.set("page", String(nextPage));
      }
      const query = params.toString();

      if (query === currentQuery) return;
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  return [page, setPage] as const;
}
