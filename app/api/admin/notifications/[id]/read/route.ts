import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { getPool } from "@/lib/db/config/client";
import {
  countUnreadNotifications,
  markNotificationRead,
  toNotificationEvent,
} from "@/lib/db/notifications";
import { logApiError } from "@/lib/logger";
import { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Marks one notification read for the caller.
 * Idempotent; scoped to the caller's own rows. Returns the updated notification
 * plus the caller's new unread count so the FE can refresh the badge in place.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid notification id." }, { status: 400 });
  }

  const db = getPool();
  try {
    const row = await markNotificationRead(db, auth.userId, id);
    if (!row) {
      return Response.json(
        { error: "Notification not found." },
        { status: 404 },
      );
    }
    const unreadCount = await countUnreadNotifications(db, auth.userId);
    return Response.json({
      notification: toNotificationEvent(row),
      readAt: row.read_at?.toISOString() ?? null,
      unreadCount,
    });
  } catch (e) {
    logApiError("Notifications mark-read: update failed", e, { id });
    return Response.json(
      { error: "Could not update notification." },
      { status: 500 },
    );
  }
}
