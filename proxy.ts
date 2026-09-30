import { NextResponse, type NextRequest } from "next/server";

import { verifyAccessToken } from "@/lib/auth/jwt";
import {
  ACCESS_TOKEN_COOKIE,
  buildAccessTokenCookie,
  buildRefreshTokenCookie,
  refreshSession,
  REFRESH_TOKEN_COOKIE,
  type SessionCookie,
} from "@/lib/auth/session";
import type { ProfileRole } from "@/lib/db/users";
import { getPool } from "@/lib/db/config/client";
import { logApiError } from "@/lib/logger";
import { createRequestId, getRequestIdFromRequest, REQUEST_ID_HEADER } from "@/lib/request-id";

type AuthedUser = { id: string; role: ProfileRole };

/**
 * Resolves the caller from the access-token cookie (signature+expiry check
 * only, no DB hit -- the fast path for most requests). On an expired/missing
 * access token, falls back to the refresh token (one DB round trip); a
 * successful refresh queues new cookies in `pendingCookies` for the caller to
 * apply to whatever response it ultimately returns, including a redirect --
 * losing the rotated refresh token on a redirect would silently invalidate
 * the session (the old token was already revoked as part of rotation).
 */
async function resolveUser(
  request: NextRequest,
  pendingCookies: SessionCookie[],
): Promise<AuthedUser | null> {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (accessToken) {
    const claims = verifyAccessToken(accessToken);
    if (claims) return { id: claims.sub, role: claims.role };
  }

  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) return null;

  try {
    const result = await refreshSession(getPool(), refreshToken, {
      userAgent: request.headers.get("user-agent"),
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });
    if (!result.ok) return null;

    pendingCookies.push(
      buildAccessTokenCookie(result.session.accessToken),
      buildRefreshTokenCookie(result.session.refreshToken),
    );
    return { id: result.session.user.id, role: result.session.user.role };
  } catch (error) {
    logApiError("Middleware session refresh error", error, {
      path: request.nextUrl.pathname,
    });
    return null;
  }
}

function applyCookies(
  response: NextResponse,
  pendingCookies: SessionCookie[],
): NextResponse {
  for (const cookie of pendingCookies) {
    response.cookies.set(cookie);
  }
  return response;
}

function attachRequestId(response: NextResponse, requestId: string): NextResponse {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

function redirectTo(
  request: NextRequest,
  pathname: string,
  params?: Record<string, string>,
): NextResponse {
  const url = request.nextUrl.clone();
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (host) {
    url.host = host;
  }
  // Keep the request's own scheme when no proxy header is present. Defaulting
  // to https sends HTTP (local, or Node behind nginx) at a TLS port that never
  // answers, so the browser stays on the loading spinner.
  if (forwardedProto) {
    url.protocol = forwardedProto.endsWith(":") ? forwardedProto : `${forwardedProto}:`;
  }
  url.pathname = pathname;
  url.search = "";
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return NextResponse.redirect(url);
}

/** Pages that must stay reachable with no session. */
function isPublicPage(path: string): boolean {
  return (
    path === "/login" ||
    path.startsWith("/login/") ||
    path.startsWith("/evaluation-preview")
  );
}

/**
 * Routes that are not browser pages. `/api/admin` still refreshes the session
 * cookie; other APIs authenticate themselves (SSO, public token, worker secret).
 */
function skipsPageLoginGate(path: string): boolean {
  if (!path.startsWith("/api/")) return false;
  return !path.startsWith("/api/admin");
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const requestId = getRequestIdFromRequest(request) ?? createRequestId();

  // Avoid a network call on public routes to keep local dev responsive.
  if (isPublicPage(path) || skipsPageLoginGate(path)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(REQUEST_ID_HEADER, requestId);
    return attachRequestId(
      NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      }),
      requestId,
    );
  }

  const pendingCookies: SessionCookie[] = [];
  const user = await resolveUser(request, pendingCookies);

  if (path === "/signup") {
    if (user) {
      return applyCookies(redirectTo(request, "/dashboard"), pendingCookies);
    }
    return applyCookies(
      redirectTo(request, "/login", { reason: "no-signup" }),
      pendingCookies,
    );
  }

  // Every other page requires a session. Staff vs dashboard-only is decided
  // later by `getStaffProfileAccess` in the layout — JWT role is not enough.
  if (!path.startsWith("/api/") && !user) {
    const next = `${path}${request.nextUrl.search}`;
    return applyCookies(
      redirectTo(request, "/login", { next }),
      pendingCookies,
    );
  }

  let response: NextResponse;
  if (pendingCookies.length > 0) {
    for (const cookie of pendingCookies) {
      request.cookies.set(cookie.name, cookie.value);
    }
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(REQUEST_ID_HEADER, requestId);
    const cookieString = request.cookies
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    requestHeaders.set("cookie", cookieString);

    response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } else {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(REQUEST_ID_HEADER, requestId);
    response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return attachRequestId(applyCookies(response, pendingCookies), requestId);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
