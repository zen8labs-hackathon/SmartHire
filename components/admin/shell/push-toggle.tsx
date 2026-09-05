"use client";

import { Bell } from "lucide-react";
import { cn } from "@heroui/react";

import { usePushSubscription } from "@/lib/notifications/use-push-subscription";

/**
 * A switch row for the user dropdown that turns Web Push on/off for this
 * device ("notify me when a tab isn't open"). Renders nothing when the
 * browser can't do push or no VAPID key is configured. Complements
 * `NotificationBell` (in-app / open-tab notifications).
 */
export function PushToggle() {
  const { supported, permission, subscribed, busy, enable, disable } =
    usePushSubscription();

  if (!supported) return null;

  const denied = permission === "denied";
  const active = subscribed && permission === "granted";

  return (
    <div className="flex items-center justify-between gap-2 border-b border-divider/60 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <Bell className="h-4 w-4 shrink-0 text-muted" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">
            Browser notifications
          </p>
          {denied ? (
            <p className="mt-0.5 text-[10px] font-medium text-muted">
              Blocked — allow them in your browser&rsquo;s site settings
            </p>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label="Toggle browser notifications"
        disabled={busy || denied}
        onClick={() => void (active ? disable() : enable())}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
          active ? "bg-accent" : "border border-divider bg-surface-tertiary",
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
            active ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
