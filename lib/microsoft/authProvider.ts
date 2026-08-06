import { ClientSecretCredential } from "@azure/identity";

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
// Refresh a bit before actual expiry so a request never races a token that
// expires mid-flight.
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

let credential: ClientSecretCredential | null = null;
let cachedToken: { token: string; expiresOnTimestamp: number } | null = null;

export function isGraphConfigured(): boolean {
  return Boolean(
    process.env.MS_GRAPH_TENANT_ID &&
      process.env.MS_GRAPH_CLIENT_ID &&
      process.env.MS_GRAPH_CLIENT_SECRET,
  );
}

function getCredential(): ClientSecretCredential {
  if (credential) return credential;

  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "Microsoft Graph is not configured (missing MS_GRAPH_TENANT_ID / MS_GRAPH_CLIENT_ID / MS_GRAPH_CLIENT_SECRET).",
    );
  }

  credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  return credential;
}

/** For tests only: forces the next call to rebuild the credential/token cache. */
export function resetGraphAuthForTests(): void {
  credential = null;
  cachedToken = null;
}

export async function getGraphAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresOnTimestamp - EXPIRY_SAFETY_MARGIN_MS > Date.now()) {
    return cachedToken.token;
  }

  const result = await getCredential().getToken(GRAPH_SCOPE);
  if (!result) {
    throw new Error("Failed to acquire a Microsoft Graph access token.");
  }

  cachedToken = result;
  return result.token;
}
