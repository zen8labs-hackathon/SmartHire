"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useNotifications } from "@/lib/notifications/use-notifications";
import { usePushSubscription } from "@/lib/notifications/use-push-subscription";
import { NotificationToastStack } from "@/components/admin/shell/notification-toast-stack";
import {
  NOTIFICATION_TYPE,
  type NotificationEvent,
} from "@/lib/redis/channels";

dayjs.extend(relativeTime);

export function NotificationIcon({ type }: { type: string }) {
  if (
    type === NOTIFICATION_TYPE.BatchComplete ||
    type === NOTIFICATION_TYPE.RerunAiMatchComplete
  ) {
    return <CheckCircle2 className="h-4 w-4 text-success shrink-0" />;
  }
  if (type === NOTIFICATION_TYPE.RerunAiMatchFailed) {
    return <XCircle className="h-4 w-4 text-danger shrink-0" />;
  }
  return <Bell className="h-4 w-4 text-muted shrink-0" />;
}

function NotificationItem({
  item,
  onOpen,
}: {
  item: NotificationEvent;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="hd-nf"
      data-unread={!item.readAt}
      onClick={onOpen}
    >
      <span className="hd-nf__row">
        <b>{item.title}</b>
        <span className="hd-nf__time">{dayjs(item.createdAt).fromNow()}</span>
      </span>
      {item.body && <span className="hd-nf__body">{item.body}</span>}
    </button>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const push = usePushSubscription();
  const pushActive = push.subscribed && push.permission === "granted";
  const {
    items,
    unreadCount,
    hasMore,
    loadingMore,
    liveToasts,
    dismissLiveToast,
    markRead,
    markAllRead,
    loadMore,
  } = useNotifications();

  const openNotification = (item: NotificationEvent) => {
    if (!item.readAt) void markRead(item.id);
    const href = item.data?.href;
    if (typeof href === "string") router.push(href);
  };

  const handleItemOpen = (item: NotificationEvent) => {
    openNotification(item);
    setOpen(false);
  };

  const handleToastClick = (item: NotificationEvent) => {
    openNotification(item);
    dismissLiveToast(item.id);
  };

  return (
    <div className="relative">
      <NotificationToastStack
        toasts={liveToasts}
        onDismiss={dismissLiveToast}
        onClick={handleToastClick}
      />

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="hd-ib"
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-expanded={open}
      >
        <Bell aria-hidden />
        {unreadCount > 0 && <span className="dot" />}
      </button>
      <span
        aria-live="polite"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
        }}
      >
        {unreadCount} new notifications
      </span>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-transparent"
          />
          <div className="hd-pop">
            <div className="hd-pop__head">
              <b>Notifications</b>
              {push.supported && (
                <button
                  type="button"
                  onClick={() =>
                    void (pushActive ? push.disable() : push.enable())
                  }
                  disabled={push.busy || push.permission === "denied"}
                  aria-pressed={pushActive}
                  aria-label={
                    pushActive
                      ? "Disable browser notifications"
                      : "Enable browser notifications"
                  }
                  title={
                    push.permission === "denied"
                      ? "Browser notifications are blocked in site settings"
                      : pushActive
                        ? "Browser notifications on — click to turn off"
                        : "Get notified when this tab is closed"
                  }
                  className="hd-ghost"
                >
                  {pushActive ? (
                    <BellRing style={{ width: 16, height: 16 }} />
                  ) : (
                    <BellOff style={{ width: 16, height: 16 }} />
                  )}
                </button>
              )}
              <button
                type="button"
                className="hd-ghost"
                disabled={unreadCount === 0}
                onClick={() => void markAllRead()}
              >
                Mark all read
              </button>
            </div>

            <div style={{ maxHeight: 420, overflow: "auto" }}>
              {items.length === 0 ? (
                <p className="px-5 py-5 text-center text-xs text-muted">
                  No notifications
                </p>
              ) : (
                items.map((item) => (
                  <NotificationItem
                    key={item.id}
                    item={item}
                    onOpen={() => handleItemOpen(item)}
                  />
                ))
              )}
              {hasMore && (
                <div className="flex justify-center p-2">
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    className="hd-ghost"
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
