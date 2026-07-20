/**
 * Guards the post-login redirect target against open-redirect: only an
 * app-relative path is allowed, so a crafted `next=` value can never send a
 * user off-site after they authenticate. Shared by the password sign-in
 * action and the Azure SSO callback so both entry points enforce the same rule.
 */
export function safeNextPath(raw: string): string {
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("://")) {
    return raw;
  }
  return "/dashboard";
}
