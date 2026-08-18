import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import {
  buildAuthorizeUrl,
  generatePkcePair,
  generateState,
  MAIL_TEST_COOKIE_PATH,
  MAIL_TEST_STATE_COOKIE,
  MAIL_TEST_STATE_TTL_SECONDS,
  type MailTestStateCookie,
} from "@/lib/auth/azure-mail-delegate";
import { isSecureCookieEnv } from "@/lib/auth/session";
import { isDevEnv } from "@/lib/env";

export async function GET(request: Request) {
  // Dev-only test tool -- never reachable in a deployed environment, so an
  // HR account can't authorize a real Graph mail-send token against
  // production. This is the authoritative gate; the UI card in
  // components/admin/dev-test/email-test-panel.tsx just hides
  // itself when this 404s, it doesn't duplicate the check.
  if (!isDevEnv()) {
    return new Response("Not found", { status: 404 });
  }

  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const state = generateState();
  const { codeVerifier, codeChallenge } = generatePkcePair();

  const cookieStore = await cookies();
  const payload: MailTestStateCookie = { state, codeVerifier };
  cookieStore.set(MAIL_TEST_STATE_COOKIE, JSON.stringify(payload), {
    httpOnly: true,
    secure: isSecureCookieEnv(),
    sameSite: "lax",
    path: MAIL_TEST_COOKIE_PATH,
    maxAge: MAIL_TEST_STATE_TTL_SECONDS,
  });

  return NextResponse.redirect(buildAuthorizeUrl({ state, codeChallenge }));
}
