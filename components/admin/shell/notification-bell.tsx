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
  ChevronDown,
  XCircle,
} from "lucide-react";
import { useNotifications } from "@/lib/notifications/use-notifications";
import { usePushSubscription } from "@/lib/notifications/use-push-subscription";
import { formatDisplayDateTime } from "@/lib/format-date";
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
  isExpanded,
  onToggleExpand,
  onOpen,
}: {
  item: NotificationEvent;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpen: () => void;
}) {
  const unread = !item.readAt;

  return (
    <div
      className={`rounded-xl border shadow-sm transition-colors ${
        unread
          ? "border-accent/30 bg-accent/5"
          : "border-divider/60 bg-surface-secondary/40"
      }`}
    >
      <div className="flex w-full items-stretch gap-1 py-1 pr-1 pl-1">
        <button
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left cursor-pointer transition-colors hover:bg-surface-secondary"
        >
          <NotificationIcon type={item.type} />
          <p
            className={`min-w-0 flex-1 text-xs line-clamp-2 ${
              unread ? "font-bold text-foreground" : "font-semibold text-muted"
            }`}
          >
            {item.title}
          </p>
          {unread && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          )}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          aria-label={isExpanded ? "Collapse" : "Expand"}
          aria-expanded={isExpanded}
          className="flex shrink-0 items-center self-center rounded-md p-1 text-muted transition-colors hover:bg-surface-tertiary hover:text-foreground cursor-pointer"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      {isExpanded && (
        <div className="pr-3 pb-2 pl-[2.375rem]">
          {item.body && (
            <p className="text-[11px] text-muted whitespace-pre-line">
              {item.body}
            </p>
          )}
          <p className="mt-1 text-[10px] text-muted/70">
            {dayjs(item.createdAt).fromNow()}
            <span className="mx-1">·</span>
            {formatDisplayDateTime(item.createdAt)}
          </p>
        </div>
      )}
    </div>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
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

  // Keep the newest notification expanded so its body shows without a click --
  // and move that auto-expansion onto each new one as it arrives, collapsing
  // the previous auto-expanded row. Rows the user expanded by hand are left
  // alone. Seeded directly (not via `toggleItemExpanded`) so it doesn't also
  // mark the row read.
  const autoExpandedIdRef = useRef<string | null>(null);
  useEffect(() => {
    const topId = items[0]?.id;
    if (!topId || topId === autoExpandedIdRef.current) return;
    const previousAutoId = autoExpandedIdRef.current;
    autoExpandedIdRef.current = topId;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (previousAutoId) next.delete(previousAutoId);
      next.add(topId);
      return next;
    });
  }, [items]);

  // Shared by a bell-dropdown item's card click and a live toast click --
  // both act on the same notification the same way: mark it read and, if it
  // points somewhere, navigate there.
  const openNotification = (item: NotificationEvent) => {
    if (!item.readAt) void markRead(item.id);
    const href = item.data?.href;
    if (typeof href === "string") router.push(href);
  };

  const handleItemOpen = (item: NotificationEvent) => {
    openNotification(item);
    setOpen(false);
  };

  const toggleItemExpanded = (item: NotificationEvent) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
    if (!item.readAt) void markRead(item.id);
  };

  const handleToastClick = (item: NotificationEvent) => {
    openNotification(item);
    dismissLiveToast(item.id);
  };

  return (
    <div className="relative font-sans">
      <NotificationToastStack
        toasts={liveToasts}
        onDismiss={dismissLiveToast}
        onClick={handleToastClick}
      />

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
          <div className="absolute right-0 mt-2 w-96 origin-top-right rounded-2xl border border-divider bg-surface-primary p-1.5 shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between px-3 py-2 border-b border-divider/60">
              <p className="text-xs font-bold text-foreground">Notifications</p>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={() => void markAllRead()}
                    className="text-xs font-semibold text-accent hover:underline cursor-pointer"
                  >
                    Mark all as read
                  </button>
                )}
                {push.supported && (
                  <button
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
                    className="flex h-6 w-6 items-center justify-center border border-divider/60 rounded-md text-muted transition-colors hover:bg-surface-secondary hover:text-foreground cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pushActive ? (
                      <BellRing className="h-3.5 w-3.5 text-accent" />
                    ) : (
                      <BellOff className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-[30rem] overflow-y-auto py-1">
              {items.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted">
                  No notifications yet.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5 px-1">
                  {items.map((item) => (
                    <NotificationItem
                      key={item.id}
                      item={item}
                      isExpanded={expandedIds.has(item.id)}
                      onToggleExpand={() => toggleItemExpanded(item)}
                      onOpen={() => handleItemOpen(item)}
                    />
                  ))}
                </div>
              )}
              {hasMore && (
                <div className="flex justify-center px-1 pt-1.5">
                  <button
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    className="rounded-md border border-divider/60 bg-surface-secondary/60 px-2.5 py-1 text-center text-[11px] font-semibold text-foreground transition-colors hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
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
