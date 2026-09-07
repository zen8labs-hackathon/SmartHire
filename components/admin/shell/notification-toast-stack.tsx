"use client";

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Bell, CheckCircle2, X, XCircle } from "lucide-react";

import {
  NOTIFICATION_TYPE,
  type NotificationEvent,
} from "@/lib/redis/channels";

dayjs.extend(relativeTime);

type Props = {
  toasts: NotificationEvent[];
  onDismiss: (id: string) => void;
  onClick: (item: NotificationEvent) => void;
};

function ToastTypeIcon({ type }: { type: string }) {
  if (
    type === NOTIFICATION_TYPE.BatchComplete ||
    type === NOTIFICATION_TYPE.RerunAiMatchComplete
  ) {
    return <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />;
  }
  if (type === NOTIFICATION_TYPE.RerunAiMatchFailed) {
    return <XCircle className="h-5 w-5 shrink-0 text-danger" />;
  }
  return <Bell className="h-5 w-5 shrink-0 text-muted" />;
}

export function NotificationToastStack({ toasts, onDismiss, onClick }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-16 right-5 z-[9999] flex w-full max-w-sm flex-col gap-3 pointer-events-none font-sans">
      {toasts.map((item) => (
        <div
          key={item.id}
          role="status"
          className="pointer-events-auto flex items-start gap-3 rounded-xl border border-divider bg-surface-primary/95 p-4 shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-5 duration-300"
        >
          <button
            onClick={() => onClick(item)}
            className="flex min-w-0 flex-1 items-start gap-3 text-left cursor-pointer"
          >
            <ToastTypeIcon type={item.type} />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
                {item.title}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                {item.body ?? "No additional details."}
              </p>
              <p className="mt-1 text-[11px] font-medium text-muted/70">
                {dayjs(item.createdAt).fromNow()}
              </p>
            </div>
          </button>
          <button
            onClick={() => onDismiss(item.id)}
            className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-surface-tertiary hover:text-foreground cursor-pointer"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
