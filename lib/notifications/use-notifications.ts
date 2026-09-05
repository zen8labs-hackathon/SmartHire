"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { playNotificationSound } from "@/lib/notifications/notification-sound";
import type { NotificationEvent } from "@/lib/redis/channels";

const SNAPSHOT_LIMIT = 10;
const LOAD_MORE_LIMIT = 10;

const LIVE_TOAST_DURATION_MS = 6000;
const MAX_LIVE_TOASTS = 5;

type SnapshotPayload = {
  items: NotificationEvent[];
  unreadCount: number;
};

export type UseNotificationsResult = {
  items: NotificationEvent[];
  unreadCount: number;
  hasMore: boolean;
  loadingMore: boolean;

  liveToasts: NotificationEvent[];
  dismissLiveToast: (id: string) => void;
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
  const [liveToasts, setLiveToasts] = useState<NotificationEvent[]>([]);
  const sourceRef = useRef<EventSource | null>(null);
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const dismissLiveToast = useCallback((id: string) => {
    setLiveToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/admin/notifications/stream");
    sourceRef.current = source;
    const timers = toastTimersRef.current;

    source.addEventListener("snapshot", (e) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data) as SnapshotPayload;
        setItems(payload.items);
        setUnreadCount(payload.unreadCount);
        // Snapshot is capped at SNAPSHOT_LIMIT server-side -- a full page
        // means there's likely more to page through via `loadMore`.
        setHasMore(payload.items.length >= SNAPSHOT_LIMIT);
      } catch (err) {
        console.error("[notifications] snapshot parse failed:", err);
      }
    });

    source.addEventListener("notification", (e) => {
      try {
        const event = JSON.parse((e as MessageEvent).data) as NotificationEvent;
        // Prepend, de-duped -- no hard cap here: slicing to SNAPSHOT_LIMIT
        // would drop rows the user paged in via `loadMore`.
        setItems((prev) =>
          prev.some((i) => i.id === event.id) ? prev : [event, ...prev],
        );
        if (!event.readAt) setUnreadCount((prev) => prev + 1);

        // Chime + toast chỉ cho event LIVE (không phát lại cho `snapshot` lúc
        // mở trang -- đó là tồn đọng cũ, không phải vừa xảy ra).
        playNotificationSound();
        setLiveToasts((prev) => [...prev, event].slice(-MAX_LIVE_TOASTS));
        const timer = setTimeout(() => {
          setLiveToasts((prev) => prev.filter((t) => t.id !== event.id));
          toastTimersRef.current.delete(event.id);
        }, LIVE_TOAST_DURATION_MS);
        toastTimersRef.current.set(event.id, timer);
      } catch (err) {
        console.error("[notifications] notification parse failed:", err);
      }
    });

    return () => {
      source.close();
      sourceRef.current = null;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

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
      console.error("[notifications] mark-read failed:", err);
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
      console.error("[notifications] mark-all-read failed:", err);
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
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...data.items.filter((i) => !seen.has(i.id))];
      });
      setHasMore(data.items.length >= LOAD_MORE_LIMIT);
    } catch (err) {
      console.error("[notifications] load-more failed:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [items]);

  return {
    items,
    unreadCount,
    hasMore,
    loadingMore,
    liveToasts,
    dismissLiveToast,
    markRead,
    markAllRead,
    loadMore,
  };
}
