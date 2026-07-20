import { createHash, randomBytes } from "node:crypto";

/**
 * "Sign in with Microsoft" -- hand-rolled OAuth2 authorization-code flow
 * against Azure AD (Entra ID), no SDK (matches the rest of lib/auth/*).
 * Scoped to a single Azure AD tenant id (AZURE_AD_TENANT_ID) -- only accounts
 * belonging to the company's own tenant can sign in, not "/organizations"
 * (any Azure AD org) and not "/common" (which also admits personal MSA
 * accounts).
 */
function getTenantId(): string {
  const tenantId = process.env.AZURE_AD_TENANT_ID;
  if (!tenantId) {
    throw new Error("Missing AZURE_AD_TENANT_ID environment variable");
  }
  return tenantId;
}

function authorizeUrl(): string {
  return `https://login.microsoftonline.com/${getTenantId()}/oauth2/v2.0/authorize`;
}

function tokenUrl(): string {
  return `https://login.microsoftonline.com/${getTenantId()}/oauth2/v2.0/token`;
}

const GRAPH_ME_URL = "https://graph.microsoft.com/v1.0/me";

const SCOPE = "openid profile email User.Read";

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

/** Single-use cookie carrying the OAuth round trip's CSRF state, PKCE verifier, and post-login redirect target. */
export const OAUTH_STATE_COOKIE = "sh_oauth_state";
export const OAUTH_STATE_TTL_SECONDS = 600;

export type OAuthStateCookie = {
  state: string;
  codeVerifier: string;
  next: string;
};

/** Anti-CSRF value round-tripped through the `sh_oauth_state` cookie and the `state` query param. */
export function generateState(): string {
  return base64url(randomBytes(32));
}

/**
 * PKCE pair. Required even though this is a confidential client (has a
 * client secret) -- current OAuth best practice mandates PKCE for every
 * client type since it defends against authorization-code interception
 * independent of client authentication.
 */
export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

function getClientId(): string {
  const clientId = process.env.AZURE_AD_CLIENT_ID;
  if (!clientId) {
    throw new Error("Missing AZURE_AD_CLIENT_ID environment variable");
  }
  return clientId;
}

function getClientSecret(): string {
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;
  if (!clientSecret) {
    throw new Error("Missing AZURE_AD_CLIENT_SECRET environment variable");
  }
  return clientSecret;
}

function getRedirectUri(): string {
  const redirectUri = process.env.AZURE_AD_REDIRECT_URI;
  if (!redirectUri) {
    throw new Error("Missing AZURE_AD_REDIRECT_URI environment variable");
  }
  return redirectUri;
}

export function buildAuthorizeUrl(params: {
  state: string;
  codeChallenge: string;
}): string {
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

export type TokenExchangeResult =
  | { ok: true; accessToken: string }
  | { ok: false; error: string };

/** Exchanges the authorization code for an access token. No id_token parsing/verification -- see fetchGraphProfile. */
export async function exchangeCodeForToken(params: {
  code: string;
  codeVerifier: string;
}): Promise<TokenExchangeResult> {
  const body = new URLSearchParams({
    client_id: getClientId(),
    client_secret: getClientSecret(),
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: getRedirectUri(),
    code_verifier: params.codeVerifier,
  });

  let response: Response;
  try {
    response = await fetch(tokenUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    return { ok: false, error: "network_error" };
  }

  if (!response.ok) {
    return { ok: false, error: `token_endpoint_${response.status}` };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, error: "invalid_token_response" };
  }

  const accessToken = (json as { access_token?: unknown }).access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    return { ok: false, error: "missing_access_token" };
  }
  return { ok: true, accessToken };
}

export type GraphProfile = { subjectId: string; email: string };

/**
 * Fetches the caller's own verified profile from Microsoft Graph. Graph
 * accepting the access token *is* the trust anchor here -- deliberately
 * avoids parsing/verifying the RS256-signed id_token (no JWKS fetch/cache/
 * rotation code needed). `id` is the stable per-account object id
 * (-> sso_subject_id); `mail` can be null for some tenants/guest accounts,
 * hence the `userPrincipalName` fallback.
 */
export async function fetchGraphProfile(
  accessToken: string,
): Promise<GraphProfile | null> {
  let response: Response;
  try {
    response = await fetch(GRAPH_ME_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return null;
  }

  const profile = json as { id?: unknown; mail?: unknown; userPrincipalName?: unknown };
  const subjectId = profile.id;
  const email =
    (typeof profile.mail === "string" && profile.mail) ||
    (typeof profile.userPrincipalName === "string" && profile.userPrincipalName) ||
    null;

  if (typeof subjectId !== "string" || !subjectId || !email) return null;
  return { subjectId, email };
}
