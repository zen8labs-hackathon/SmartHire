import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { getPool } from "@/lib/db/config/client";
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  toNotificationEvent,
} from "@/lib/db/notifications";
import { logApiError } from "@/lib/logger";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before") ?? undefined;
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  const db = getPool();
  try {
    const items = await listNotifications(db, auth.userId, { before, limit });
    return Response.json({ items: items.map(toNotificationEvent) });
  } catch (e) {
    logApiError("Notifications list: query failed", e, {
      userId: auth.userId,
    });
    return Response.json(
      { error: "Could not load notifications." },
      { status: 500 },
    );
  }
}

/**
 * Marks every unread notification for the caller read ("mark all as read").
 * Returns how many rows flipped and the resulting unread count (0).
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const db = getPool();
  try {
    const updated = await markAllNotificationsRead(db, auth.userId);
    const unreadCount = await countUnreadNotifications(db, auth.userId);
    return Response.json({ updated, unreadCount });
  } catch (e) {
    logApiError("Notifications mark-all-read: update failed", e, {
      userId: auth.userId,
    });
    return Response.json(
      { error: "Could not update notifications." },
      { status: 500 },
    );
  }
}
