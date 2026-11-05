/** Re-application cooldown (BR-06): a warning only, never blocks or lowers a score. */
export const COOLDOWN_MONTHS = 6;
export const COOLDOWN_DAYS = COOLDOWN_MONTHS * 30.44;
const DAY_MS = 86_400_000;

export const END_REASONS = ["skills", "salary", "culture", "withdrew", "noshow", "closed", "other"] as const;
export type EndReason = (typeof END_REASONS)[number];
export const REHIRE_STATUSES = ["eligible", "ask", "not_eligible"] as const;
export type RehireStatus = (typeof REHIRE_STATUSES)[number];

export const REHIRE_LABEL: Record<RehireStatus, string> = {
  eligible: "Eligible",
  ask: "Ask HR first",
  not_eligible: "Not eligible",
};

type CooldownApp = { id: string; ended_at: string | null; hired_at?: string | null };

/**
 * The most recent ended application still inside the cooldown window, shown
 * only while the candidate has an open application. Null otherwise.
 */
export function activeCooldown<T extends CooldownApp>(apps: T[], now: Date = new Date()): T | null {
  const open = apps.some((a) => !a.ended_at && !a.hired_at);
  if (!open) return null;
  const hit = apps
    .filter((a) => a.ended_at && (now.getTime() - new Date(a.ended_at).getTime()) / DAY_MS < COOLDOWN_DAYS)
    .sort((a, b) => new Date(b.ended_at!).getTime() - new Date(a.ended_at!).getTime());
  return hit[0] ?? null;
}
