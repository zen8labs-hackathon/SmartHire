import { createHash, randomBytes } from "node:crypto";
import { logError } from "@/lib/logger";

/**
 * Delegated-permission OAuth2 flow for the "test send email as me" sub-flow
 * (see components/admin/dev-test/email-test-panel.tsx). Kept
 * entirely separate from lib/auth/azure.ts (the "Sign in with Microsoft"
 * login flow): this is a testing tool for the Mail.Send delegated scope,
 * not a login mechanism, and must never touch the app session/cookies that
 * lib/auth/azure.ts issues. Reuses the same Azure AD app registration
 * (AZURE_AD_CLIENT_ID/SECRET/TENANT_ID) -- that app registration must have
 * the delegated `Mail.Send` permission added and this flow's own redirect
 * URI (AZURE_AD_MAIL_TEST_REDIRECT_URI) registered in the Azure Portal.
 *
 * By design there is no `offline_access` scope and no refresh token: the
 * access token lives only in a short-lived httpOnly cookie
 * (MAIL_TEST_TOKEN_COOKIE) for the duration of its own ~1h Graph lifetime.
 * When it expires the admin just reconnects -- this is a manual test tool,
 * not a persistent mailbox connection.
 */
const SCOPE = "Mail.Send";

function getTenantId(): string {
  const tenantId = process.env.AZURE_AD_TENANT_ID;
  if (!tenantId) throw new Error("Missing AZURE_AD_TENANT_ID environment variable");
  return tenantId;
}

function authorizeUrl(): string {
  return `https://login.microsoftonline.com/${getTenantId()}/oauth2/v2.0/authorize`;
}

function tokenUrl(): string {
  return `https://login.microsoftonline.com/${getTenantId()}/oauth2/v2.0/token`;
}

function getClientId(): string {
  const clientId = process.env.AZURE_AD_CLIENT_ID;
  if (!clientId) throw new Error("Missing AZURE_AD_CLIENT_ID environment variable");
  return clientId;
}

function getClientSecret(): string {
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;
  if (!clientSecret) throw new Error("Missing AZURE_AD_CLIENT_SECRET environment variable");
  return clientSecret;
}

function getRedirectUri(): string {
  const redirectUri = process.env.AZURE_AD_MAIL_TEST_REDIRECT_URI;
  if (!redirectUri) {
    throw new Error("Missing AZURE_AD_MAIL_TEST_REDIRECT_URI environment variable");
  }
  return redirectUri;
}

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

/** Single-use cookie carrying this flow's own CSRF state + PKCE verifier. Separate from OAUTH_STATE_COOKIE in lib/auth/azure.ts. */
export const MAIL_TEST_STATE_COOKIE = "sh_mail_test_oauth_state";
export const MAIL_TEST_STATE_TTL_SECONDS = 600;
/** Where the resulting delegated access token is held -- cookie-only, never persisted to the DB. */
export const MAIL_TEST_TOKEN_COOKIE = "sh_mail_test_token";
/**
 * Both cookies above are scoped to this path so they never ride along on
 * unrelated requests -- kept at the shared `/api/admin/email` prefix (not
 * `/api/admin/email/oauth/microsoft`) so the token cookie set here is also
 * sent to `/api/admin/email/dev-test/send`, which lives under a sibling
 * path and needs to read it for `mode: "delegated"` sends.
 */
export const MAIL_TEST_COOKIE_PATH = "/api/admin/email";

export type MailTestStateCookie = { state: string; codeVerifier: string };
export type MailTestTokenCookie = { accessToken: string; expiresAt: number };

export function generateState(): string {
  return base64url(randomBytes(32));
}

export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

export function buildAuthorizeUrl(params: { state: string; codeChallenge: string }): string {
  const url = new URL(authorizeUrl());
  url.searchParams.set("client_id", getClientId());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", getRedirectUri());
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export type MailTestTokenExchangeResult =
  | { ok: true; accessToken: string; expiresInSeconds: number }
  | { ok: false; error: string };

export async function exchangeCodeForMailTestToken(params: {
  code: string;
  codeVerifier: string;
}): Promise<MailTestTokenExchangeResult> {
  const body = new URLSearchParams({
    client_id: getClientId(),
    client_secret: getClientSecret(),
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: getRedirectUri(),
    code_verifier: params.codeVerifier,
    scope: SCOPE,
  });

  let response: Response;
  try {
    response = await fetch(tokenUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (error) {
    logError(
      "Mail-test Azure token exchange network error",
      error instanceof Error ? error : undefined,
    );
    return { ok: false, error: "network_error" };
  }

  if (!response.ok) {
    logError("Mail-test Azure token exchange failed", undefined, {
      status: response.status,
      reason: `token_endpoint_${response.status}`,
    });
    return { ok: false, error: `token_endpoint_${response.status}` };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, error: "invalid_token_response" };
  }

  const parsed = json as { access_token?: unknown; expires_in?: unknown };
  const accessToken = parsed.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    return { ok: false, error: "missing_access_token" };
  }
  const expiresInSeconds = typeof parsed.expires_in === "number" ? parsed.expires_in : 3599;
  return { ok: true, accessToken, expiresInSeconds };
}
