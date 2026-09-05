"use client";

/**
 * Browser-side Web Push helpers: register the service worker
 * (`public/sw.js`), (un)subscribe via the Push API, and mirror the
 * subscription to the server (`/api/admin/push-subscriptions`).
 *
 * The server-side sender lives in `lib/notifications/web-push.ts`.
 */

const SW_URL = "/sw.js";
const SUBSCRIPTIONS_ENDPOINT = "/api/admin/push-subscriptions";

/** Web Push needs a service worker, the Push API, and the Notification API. */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * A VAPID public key is URL-safe base64; `pushManager.subscribe` wants the
 * decoded bytes.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/** Registers the SW if it isn't already, returning the active registration. */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_URL);
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  const res = await fetch(SUBSCRIPTIONS_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!res.ok) throw new Error(`save subscription failed: ${res.status}`);
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/**
 * Subscribes this browser to Web Push and records it server-side. Reuses an
 * existing local subscription if one is already active. Assumes the caller
 * has already obtained `Notification` permission.
 */
export async function subscribeToPush(
  vapidPublicKey: string,
): Promise<PushSubscription> {
  const registration = await ensureServiceWorker();
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  await saveSubscription(subscription);
  return subscription;
}

/** Drops the server row then the local subscription. Idempotent. */
export async function unsubscribeFromPush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  await fetch(SUBSCRIPTIONS_ENDPOINT, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => {
    // Best-effort: still unsubscribe locally even if the server call fails --
    // a stale row is pruned on the next failed send.
  });

  await subscription.unsubscribe();
}
