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

function redirectTo(
  request: NextRequest,
  pathname: string,
  params?: Record<string, string>,
): NextResponse {
  const url = request.nextUrl.clone();
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (host) {
    url.protocol = proto;
    url.host = host;
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

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const needsAuthCheck =
    path === "/signup" ||
    path.startsWith("/admin") ||
    path.startsWith("/dashboard") ||
    path.startsWith("/api/admin");

  // Avoid a network call on public routes to keep local dev responsive.
  if (!needsAuthCheck) {
    return NextResponse.next({ request });
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

  if (path.startsWith("/admin")) {
    if (!user) {
      return applyCookies(
        redirectTo(request, "/login", { next: "/admin" }),
        pendingCookies,
      );
    }
    // Auth only here. Staff vs dashboard-only (including `role=none` users who
    // still have chapter memberships) is decided by `getStaffProfileAccess` in
    // `app/admin/layout.tsx` — JWT `role` alone is not authoritative.
  }

  if (path.startsWith("/dashboard") && !user) {
    return applyCookies(
      redirectTo(request, "/login", { next: path }),
      pendingCookies,
    );
  }

  let response: NextResponse;
  if (pendingCookies.length > 0) {
    for (const cookie of pendingCookies) {
      request.cookies.set(cookie.name, cookie.value);
    }
    const requestHeaders = new Headers(request.headers);
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
    response = NextResponse.next({ request });
  }

  return applyCookies(response, pendingCookies);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
