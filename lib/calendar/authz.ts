/**
 * Calendar authorization rules (BA v1.1):
 * - A session is visible to HR/Admin, anyone with view access to its job, and
 *   its assigned interviewers (who get a limited view without a job grant).
 * - Reschedule/cancel: the organizer, or HR/Admin/Recruiter. A Chapter Head
 *   without one of those roles may only change sessions they organized.
 * - Company working hours are edited by HR only.
 */

import type { StaffProfileAccess } from "@/lib/admin/profile-access";

export type SessionAccessInfo = {
  /** Organizer (`candidate_schedules.created_by`). */
  createdBy: string | null;
  interviewerIds: string[];
};

export type CalendarViewer = Pick<StaffProfileAccess, "userId" | "role" | "isAdmin" | "isHr">;

export function isOrganizer(viewer: CalendarViewer, session: SessionAccessInfo): boolean {
  return session.createdBy !== null && session.createdBy === viewer.userId;
}

export function isAssignedInterviewer(viewer: CalendarViewer, session: SessionAccessInfo): boolean {
  return session.interviewerIds.includes(viewer.userId);
}

export function canSeeSession(
  viewer: CalendarViewer,
  session: SessionAccessInfo,
  opts: { canViewJob: boolean },
): boolean {
  return (
    viewer.isAdmin ||
    viewer.isHr ||
    opts.canViewJob ||
    isOrganizer(viewer, session) ||
    isAssignedInterviewer(viewer, session)
  );
}

export function canReschedule(viewer: CalendarViewer, session: SessionAccessInfo): boolean {
  return (
    viewer.isAdmin || viewer.isHr || viewer.role === "recruiter" || isOrganizer(viewer, session)
  );
}

/** Cancel follows the same rule as reschedule. */
export const canCancel = canReschedule;

export function canEditHours(viewer: CalendarViewer): boolean {
  return viewer.isHr;
}
