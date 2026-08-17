import { cookies } from "next/headers";

import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import {
  MAIL_TEST_COOKIE_PATH,
  MAIL_TEST_TOKEN_COOKIE,
  type MailTestTokenCookie,
} from "@/lib/auth/azure-mail-delegate";
import { isSecureCookieEnv } from "@/lib/auth/session";
import { isDevEnv } from "@/lib/env";

export async function GET(request: Request) {
  // Dev-only test tool -- see app/api/admin/email/oauth/microsoft/authorize/route.ts.
  // This 404 is also what components/admin/dev-test/email-test-panel.tsx
  // uses to decide whether to render itself, since the client bundle has no
  // reliable way to read APP_ENV directly.
  if (!isDevEnv()) {
    return new Response("Not found", { status: 404 });
  }

  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const cookieStore = await cookies();
  const raw = cookieStore.get(MAIL_TEST_TOKEN_COOKIE)?.value;
  if (!raw) return Response.json({ connected: false });

  let parsed: MailTestTokenCookie;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return Response.json({ connected: false });
  }

  if (!parsed.expiresAt || parsed.expiresAt <= Date.now()) {
    return Response.json({ connected: false });
  }

  return Response.json({ connected: true, expiresAt: parsed.expiresAt });
}

export async function DELETE(request: Request) {
  if (!isDevEnv()) {
    return new Response("Not found", { status: 404 });
  }

  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const cookieStore = await cookies();
  cookieStore.set(MAIL_TEST_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: isSecureCookieEnv(),
    sameSite: "lax",
    path: MAIL_TEST_COOKIE_PATH,
    maxAge: 0,
  });
  return Response.json({ connected: false });
}
