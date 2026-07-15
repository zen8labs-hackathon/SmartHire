import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import {
  exchangeCodeForToken,
  fetchGraphProfile,
  OAUTH_STATE_COOKIE,
  type OAuthStateCookie,
} from "@/lib/auth/azure";
import { safeNextPath } from "@/lib/auth/next-path";
import { getRequestMeta } from "@/lib/auth/request-meta";
import {
  buildAccessTokenCookie,
  buildRefreshTokenCookie,
  issueSession,
} from "@/lib/auth/session";
import { getPool } from "@/lib/db/config/client";
import {
  getUserBySsoIdentity,
  linkSsoIdentity,
  type UserRow,
} from "@/lib/db/users";

const SSO_PROVIDER = "azure_ad";

function loginRedirect(request: NextRequest, reason: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("reason", reason);
  return NextResponse.redirect(url);
}

function toPublicUser(user: UserRow) {
  const {
    password_hash: _password_hash,
    sso_provider: _sso_provider,
    sso_subject_id: _sso_subject_id,
    ...publicUser
  } = user;
  return publicUser;
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const rawState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  // Single-use: clear regardless of outcome.
  cookieStore.delete(OAUTH_STATE_COOKIE);

  const params = request.nextUrl.searchParams;

  if (params.get("error")) {
    return loginRedirect(request, "sso-cancelled");
  }

  let stateCookie: OAuthStateCookie;
  try {
    if (!rawState) throw new Error("missing");
    stateCookie = JSON.parse(rawState);
  } catch {
    return loginRedirect(request, "sso-expired");
  }

  const state = params.get("state");
  if (!state || state !== stateCookie.state) {
    return loginRedirect(request, "sso-invalid-state");
  }

  const code = params.get("code");
  if (!code) {
    return loginRedirect(request, "sso-failed");
  }

  const tokenResult = await exchangeCodeForToken({
    code,
    codeVerifier: stateCookie.codeVerifier,
  });
  if (!tokenResult.ok) {
    return loginRedirect(request, "sso-failed");
  }

  const profile = await fetchGraphProfile(tokenResult.accessToken);
  if (!profile) {
    return loginRedirect(request, "sso-failed");
  }

  const db = getPool();
  const meta = await getRequestMeta();

  try {
    let user = await getUserBySsoIdentity(db, SSO_PROVIDER, profile.subjectId);
    if (!user) {
      user = await linkSsoIdentity(db, {
        email: profile.email,
        provider: SSO_PROVIDER,
        subjectId: profile.subjectId,
      });
    }
    if (!user) {
      return loginRedirect(request, "sso-not-invited");
    }

    const session = await issueSession(db, toPublicUser(user), meta);

    const next = safeNextPath(stateCookie.next);
    const response = NextResponse.redirect(new URL(next, request.nextUrl.origin));
    response.cookies.set(buildAccessTokenCookie(session.accessToken));
    response.cookies.set(buildRefreshTokenCookie(session.refreshToken));
    return response;
  } catch {
    return loginRedirect(request, "sso-failed");
  }
}
