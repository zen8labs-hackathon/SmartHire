"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/admin/toast-provider";
import {
  NOTIFICATION_TYPE,
  type NotificationEvent,
} from "@/lib/redis/channels";

const SNAPSHOT_LIMIT = 20;
const LOAD_MORE_LIMIT = 20;

type SnapshotPayload = {
  items: NotificationEvent[];
  unreadCount: number;
};

export type UseNotificationsResult = {
  items: NotificationEvent[];
  unreadCount: number;
  hasMore: boolean;
  loadingMore: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  loadMore: () => Promise<void>;
};

/**
 * Mở 1 kết nối SSE tới `/api/admin/notifications/stream` cho toàn bộ vòng đời
 * component gọi hook này. Trình duyệt tự reconnect khi mất kết nối (hành vi
 * mặc định của EventSource), server sẽ gửi lại `snapshot` nên không mất dữ liệu.
 */
export function useNotifications(): UseNotificationsResult {
  const [items, setItems] = useState<NotificationEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);
  const { success, error } = useToast();

  useEffect(() => {
    const source = new EventSource("/api/admin/notifications/stream");
    sourceRef.current = source;

    source.addEventListener("snapshot", (e) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data) as SnapshotPayload;
        setItems(payload.items);
        setUnreadCount(payload.unreadCount);
        // Snapshot is capped at SNAPSHOT_LIMIT server-side -- a full page
        // means there's likely more to page through via `loadMore`.
        setHasMore(payload.items.length >= SNAPSHOT_LIMIT);
      } catch (err) {
        console.error("[notifications] snapshot parse lỗi:", err);
      }
    });

    source.addEventListener("notification", (e) => {
      try {
        const event = JSON.parse((e as MessageEvent).data) as NotificationEvent;
        setItems((prev) => [event, ...prev].slice(0, SNAPSHOT_LIMIT));
        if (!event.readAt) setUnreadCount((prev) => prev + 1);

        // Toast chỉ bắn cho event LIVE (không bắn lại cho `snapshot` lúc mở
        // trang -- đó là tồn đọng cũ, không phải vừa xảy ra).
        const message = event.body
          ? `${event.title} — ${event.body}`
          : event.title;
        if (event.type === NOTIFICATION_TYPE.RerunAiMatchFailed) {
          error(message);
        } else {
          success(message);
        }
      } catch (err) {
        console.error("[notifications] notification parse lỗi:", err);
      }
    });

    return () => {
      source.close();
      sourceRef.current = null;
    };
    // `success`/`error` (từ useToast()) ổn định qua re-render -- ToastProvider
    // bọc chúng trong useMemo/useCallback -- nên liệt kê ở đây không làm effect
    // này chạy lại (không mở thêm kết nối SSE).
  }, [success, error]);

  const markRead = useCallback(async (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id && !item.readAt
          ? { ...item, readAt: new Date().toISOString() }
          : item,
      ),
    );
    try {
      const res = await fetch(`/api/admin/notifications/${id}/read`, {
        method: "PATCH",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { unreadCount: number };
      setUnreadCount(data.unreadCount);
    } catch (err) {
      console.error("[notifications] mark-read lỗi:", err);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((item) => (item.readAt ? item : { ...item, readAt: now })),
    );
    setUnreadCount(0);
    try {
      await fetch("/api/admin/notifications", { method: "PATCH" });
    } catch (err) {
      console.error("[notifications] mark-all-read lỗi:", err);
    }
  }, []);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const cursor = items[items.length - 1]?.id;
      if (!cursor) return;

      const params = new URLSearchParams({
        before: cursor,
        limit: String(LOAD_MORE_LIMIT),
      });
      const res = await fetch(`/api/admin/notifications?${params}`);
      if (!res.ok) return;

      const data = (await res.json()) as { items: NotificationEvent[] };
      setItems((prev) => [...prev, ...data.items]);
      setHasMore(data.items.length >= LOAD_MORE_LIMIT);
    } catch (err) {
      console.error("[notifications] load-more lỗi:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [items]);

  return {
    items,
    unreadCount,
    hasMore,
    loadingMore,
    markRead,
    markAllRead,
    loadMore,
  };
}
