import type { NotificationEvent } from "@/lib/redis/channels";

/**
 * Registry in-memory cho SSE notification: map userId -> tập callback của
 * mỗi kết nối đang mở trên CHÍNH process này.
 */

declare global {
  var __notificationRegistry:
    | Map<string, Set<(event: NotificationEvent) => void>>
    | undefined;
}

const registry =
  global.__notificationRegistry ??
  new Map<string, Set<(event: NotificationEvent) => void>>();
global.__notificationRegistry = registry;

/** Đăng ký nhận notification realtime của 1 user. Trả về hàm huỷ đăng ký. */
export function subscribe(
  userId: string,
  handler: (event: NotificationEvent) => void,
): () => void {
  let handlers = registry.get(userId);
  if (!handlers) {
    handlers = new Set();
    registry.set(userId, handlers);
  }
  handlers.add(handler);

  return () => {
    const current = registry.get(userId);
    if (!current) return;
    current.delete(handler);
    if (current.size === 0) registry.delete(userId);
  };
}

/** Bắn event tới mọi kết nối SSE đang mở của user đó trên process này. */
export function publish(userId: string, event: NotificationEvent): void {
  const handlers = registry.get(userId);
  if (!handlers) return;
  for (const handler of handlers) {
    try {
      handler(event);
    } catch (err) {
      console.error(
        `[notification-registry] handler lỗi cho user ${userId}:`,
        err,
      );
    }
  }
}
