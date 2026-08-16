/**
 * Gates dev-only tooling (e.g. the delegated Mail.Send test flow under
 * app/api/admin/email/oauth/microsoft/*) behind an explicit opt-in. Unset
 * APP_ENV is treated as "not dev" -- fail closed, so a deployment that
 * forgets to set the var doesn't accidentally expose a test-only surface.
 * Reads process.env fresh on every call rather than caching at module load,
 * since tests may set/unset APP_ENV at runtime.
 */
export function isDevEnv(): boolean {
  return process.env.APP_ENV === "development";
}
