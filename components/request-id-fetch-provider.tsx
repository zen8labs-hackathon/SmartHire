"use client";

import { useEffect } from "react";

import { REQUEST_ID_HEADER } from "@/lib/request-id";

function shouldAttachRequestId(url: URL): boolean {
  return url.origin === window.location.origin && url.pathname.startsWith("/api/");
}

export function RequestIdFetchProvider() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const baseUrl = window.location.href;
      const url =
        input instanceof Request
          ? new URL(input.url, baseUrl)
          : new URL(typeof input === "string" ? input : input.toString(), baseUrl);

      if (!shouldAttachRequestId(url)) {
        return originalFetch(input, init);
      }

      const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
      if (!headers.has(REQUEST_ID_HEADER)) {
        headers.set(REQUEST_ID_HEADER, crypto.randomUUID());
      }

      if (input instanceof Request) {
        const request = new Request(input, {
          ...init,
          headers,
        });
        return originalFetch(request);
      }

      return originalFetch(input, {
        ...init,
        headers,
      });
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
