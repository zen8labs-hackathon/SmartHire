import type { NotificationEvent } from "@/lib/redis/channels";

/**
 * Client dành cho worker (process riêng) để "hích" 1 notification realtime
 * tới server -- xem `app/api/internal/notifications/push/route.ts`. Thay thế
 * `publishNotification` (Redis PUBLISH, `lib/redis/pub.ts`) trong thử nghiệm
 * bỏ Redis pub/sub. Gọi SAU khi đã INSERT row `notifications` thành công.
 */
export async function pushNotification(
  userId: string,
  event: NotificationEvent,
): Promise<void> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    console.error(
      "[pushNotification] missing INTERNAL_API_SECRET, skipping realtime push",
    );
    return;
  }

  const baseUrl = process.env.INTERNAL_APP_URL ?? "http://localhost:3000";

  try {
    const res = await fetch(
      `${baseUrl}/api/internal/notifications/push`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-secret": secret,
        },
        body: JSON.stringify({ userId, event }),
      },
    );
    if (!res.ok) {
      console.error(`[pushNotification] server returned ${res.status}`);
    }
  } catch (err) {
    console.error("[pushNotification] internal API call failed:", err);
  }
}
