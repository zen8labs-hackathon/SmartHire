import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import {
  exchangeCodeForMailTestToken,
  MAIL_TEST_COOKIE_PATH,
  MAIL_TEST_STATE_COOKIE,
  MAIL_TEST_TOKEN_COOKIE,
  type MailTestStateCookie,
  type MailTestTokenCookie,
} from "@/lib/auth/azure-mail-delegate";
import { isSecureCookieEnv } from "@/lib/auth/session";
import { isDevEnv } from "@/lib/env";
import { logError } from "@/lib/logger";

function redirectToDevTestPage(request: NextRequest, params: Record<string, string>): NextResponse {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const url = new URL("/admin/dev-test", `${proto}://${host}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  // Dev-only test tool -- see app/api/admin/email/oauth/microsoft/authorize/route.ts.
  if (!isDevEnv()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const cookieStore = await cookies();
  const rawState = cookieStore.get(MAIL_TEST_STATE_COOKIE)?.value;
  // Single-use: clear regardless of outcome.
  cookieStore.delete(MAIL_TEST_STATE_COOKIE);

  const auth = await requireHrForRequest(request);
  if (!auth.ok) {
    return redirectToDevTestPage(request, { mailTestError: "unauthorized" });
  }

  const params = request.nextUrl.searchParams;
  if (params.get("error")) {
    return redirectToDevTestPage(request, { mailTestError: "cancelled" });
  }

  let stateCookie: MailTestStateCookie;
  try {
    if (!rawState) throw new Error("missing");
    stateCookie = JSON.parse(rawState);
  } catch {
    return redirectToDevTestPage(request, { mailTestError: "expired" });
  }

  const state = params.get("state");
  if (!state || state !== stateCookie.state) {
    return redirectToDevTestPage(request, { mailTestError: "invalid_state" });
  }

  const code = params.get("code");
  if (!code) {
    return redirectToDevTestPage(request, { mailTestError: "failed" });
  }

  const tokenResult = await exchangeCodeForMailTestToken({
    code,
    codeVerifier: stateCookie.codeVerifier,
  });
  if (!tokenResult.ok) {
    logError("Mail-test Graph token exchange failed", undefined, {
      path: "/api/admin/email/oauth/microsoft/callback",
      reason: tokenResult.error,
    });
    return redirectToDevTestPage(request, { mailTestError: "failed" });
  }

  const response = redirectToDevTestPage(request, { mailTestConnected: "1" });
  const tokenPayload: MailTestTokenCookie = {
    accessToken: tokenResult.accessToken,
    expiresAt: Date.now() + tokenResult.expiresInSeconds * 1000,
  };
  response.cookies.set(MAIL_TEST_TOKEN_COOKIE, JSON.stringify(tokenPayload), {
    httpOnly: true,
    secure: isSecureCookieEnv(),
    sameSite: "lax",
    path: MAIL_TEST_COOKIE_PATH,
    maxAge: tokenResult.expiresInSeconds,
  });
  return response;
}
