import type { NextRequest } from "next/server";

/**
 * Clones `request.nextUrl` with the public-facing origin applied.
 *
 * Behind nginx the app listens on an internal port (3100), which `nextUrl`
 * carries over. Assigning `url.host = "example.com"` keeps that old port
 * (WHATWG URL semantics), so the port is cleared explicitly unless the
 * forwarded/Host header includes one.
 */
export function publicUrlFromRequest(request: NextRequest): URL {
  const url = request.nextUrl.clone();
  const host =
    firstHeaderValue(request, "x-forwarded-host") || firstHeaderValue(request, "host");
  if (host) {
    const proto = firstHeaderValue(request, "x-forwarded-proto") || "https";
    url.protocol = proto;
    url.port = "";
    url.host = host;
  }
  return url;
}

/** Proxy chains append to `x-forwarded-*` ("a.com, b.com"); the first hop is the client-facing one. */
function firstHeaderValue(request: NextRequest, name: string): string | undefined {
  return request.headers.get(name)?.split(",")[0]?.trim() || undefined;
}
