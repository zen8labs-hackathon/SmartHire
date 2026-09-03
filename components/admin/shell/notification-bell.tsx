"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Bell, CheckCircle2, XCircle } from "lucide-react";
import { useNotifications } from "@/lib/notifications/use-notifications";
import {
  NOTIFICATION_TYPE,
  type NotificationEvent,
} from "@/lib/redis/channels";

dayjs.extend(relativeTime);

function NotificationIcon({ type }: { type: string }) {
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
  onClick,
}: {
  item: NotificationEvent;
  onClick: () => void;
}) {
  const unread = !item.readAt;

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left rounded-xl transition-colors cursor-pointer hover:bg-surface-secondary ${
        unread ? "bg-accent/5" : ""
      }`}
    >
      <NotificationIcon type={item.type} />
      <div className="min-w-0 flex-1">
        <p
          className={`text-xs truncate ${
            unread ? "font-bold text-foreground" : "font-semibold text-muted"
          }`}
        >
          {item.title}
        </p>
        {item.body && (
          <p className="text-[11px] text-muted mt-0.5 line-clamp-2">
            {item.body}
          </p>
        )}
        <p className="text-[10px] text-muted/70 mt-1">
          {dayjs(item.createdAt).fromNow()}
        </p>
      </div>
      {unread && (
        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      )}
    </button>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const {
    items,
    unreadCount,
    hasMore,
    loadingMore,
    markRead,
    markAllRead,
    loadMore,
  } = useNotifications();

  const handleItemClick = (item: NotificationEvent) => {
    if (!item.readAt) void markRead(item.id);
    setOpen(false);

    const href = item.data?.href;
    if (typeof href === "string") router.push(href);
  };

  return (
    <div className="relative font-sans">
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-surface-primary hover:bg-surface-secondary text-muted hover:text-foreground border border-divider/60 transition-all cursor-pointer"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-transparent"
          />
          <div className="absolute right-0 mt-2 w-80 origin-top-right rounded-2xl border border-divider bg-surface-primary p-1.5 shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between px-3 py-2 border-b border-divider/60">
              <p className="text-xs font-bold text-foreground">Notifications</p>
              {unreadCount > 0 && (
                <button
                  onClick={() => void markAllRead()}
                  className="text-[10px] font-semibold text-accent hover:underline cursor-pointer"
                >
                  Mark all as read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto py-1">
              {items.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted">
                  No notifications yet.
                </p>
              ) : (
                items.map((item) => (
                  <NotificationItem
                    key={item.id}
                    item={item}
                    onClick={() => handleItemClick(item)}
                  />
                ))
              )}
              {hasMore && (
                <button
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="w-full px-3 py-2 text-center text-[10px] font-semibold text-accent hover:underline cursor-pointer disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
