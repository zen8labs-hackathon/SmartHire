/**
 * Calendar authorization rules (BA v1.1):
 * - A session is visible to HR/Admin, anyone with view access to its job, and
 *   its assigned interviewers (who get a limited view without a job grant).
 * - Create/cancel (BR-INT-01): HR, Admin or a Recruiter only.
 * - Reschedule (BR-07-01): the same managers, plus the session's organizer --
 *   so a Chapter Head may reschedule only sessions they organized.
 * - Company working hours are edited by HR only.
 */

import type { StaffProfileAccess } from "@/lib/admin/profile-access";

export type SessionAccessInfo = {
  /** Organizer (`candidate_schedules.created_by`). */
  createdBy: string | null;
  interviewerIds: string[];
};

export type CalendarViewer = Pick<StaffProfileAccess, "userId" | "role" | "isAdmin" | "isHr"> &
  Partial<Pick<StaffProfileAccess, "headedChapterIds">>;

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

/**
 * BR-INT-01: who may create, reschedule or cancel interview sessions. Mirrors
 * the PM2 UI role mapping, where a non-HR chapter head acts as "CH" even when
 * their account role is recruiter.
 */
export function canManageInterviews(viewer: CalendarViewer): boolean {
  if (viewer.isAdmin || viewer.isHr) return true;
  return viewer.role === "recruiter" && (viewer.headedChapterIds?.length ?? 0) === 0;
}

export function canReschedule(viewer: CalendarViewer, session?: SessionAccessInfo): boolean {
  return canManageInterviews(viewer) || (session !== undefined && isOrganizer(viewer, session));
}

/** Cancel stays with interview managers (BR-INT-01); organizing grants nothing extra. */
export function canCancel(viewer: CalendarViewer, _session?: SessionAccessInfo): boolean {
  return canManageInterviews(viewer);
}

export function canEditHours(viewer: CalendarViewer): boolean {
  return viewer.isAdmin || viewer.isHr;
}
