import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import {
  buildAuthorizeUrl,
  generatePkcePair,
  generateState,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
  type OAuthStateCookie,
} from "@/lib/auth/azure";
import { safeNextPath } from "@/lib/auth/next-path";
import { isSecureCookieEnv } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const nextRaw = request.nextUrl.searchParams.get("next") ?? "/dashboard";
  const next = safeNextPath(nextRaw);

  const state = generateState();
  const { codeVerifier, codeChallenge } = generatePkcePair();

  const cookieStore = await cookies();
  const payload: OAuthStateCookie = { state, codeVerifier, next };
  cookieStore.set(OAUTH_STATE_COOKIE, JSON.stringify(payload), {
    httpOnly: true,
    secure: isSecureCookieEnv(),
    sameSite: "lax",
    path: "/api/auth/azure",
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });

  return NextResponse.redirect(buildAuthorizeUrl({ state, codeChallenge }));
}
