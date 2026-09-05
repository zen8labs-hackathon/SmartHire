"use client";

import { useCallback, useEffect, useState } from "react";

import {
  getExistingSubscription,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/notifications/push-client";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type UsePushSubscriptionResult = {
  /** Push is usable in this browser and a VAPID key is configured. */
  supported: boolean;
  /** `Notification.permission`, or null until resolved on mount. */
  permission: NotificationPermission | null;
  /** This browser currently has an active, server-recorded subscription. */
  subscribed: boolean;
  /** An enable/disable call is in flight. */
  busy: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
};

/**
 * Drives the "browser notifications" toggle: tracks support/permission/
 * subscription state and exposes `enable`/`disable`. `enable` prompts for
 * `Notification` permission then subscribes; `disable` unsubscribes.
 */
export function usePushSubscription(): UsePushSubscriptionResult {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ok = isPushSupported() && VAPID_PUBLIC_KEY !== "";
    setSupported(ok);
    if (!ok) return;

    setPermission(Notification.permission);
    void getExistingSubscription().then((sub) => setSubscribed(sub !== null));
  }, []);

  const enable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return;

      await subscribeToPush(VAPID_PUBLIC_KEY);
      setSubscribed(true);
    } catch (err) {
      console.error("[push] enable failed:", err);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const disable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await unsubscribeFromPush();
      setSubscribed(false);
    } catch (err) {
      console.error("[push] disable failed:", err);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return { supported, permission, subscribed, busy, enable, disable };
}
