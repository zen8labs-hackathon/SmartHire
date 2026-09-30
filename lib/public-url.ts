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
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") || "https";
    url.protocol = proto;
    url.port = "";
    url.host = host;
  }
  return url;
}
