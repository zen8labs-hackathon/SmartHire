import type { QueryExecutor } from "@/lib/db/config/client";
import { listCandidateNotesByCampaignApplied } from "@/lib/db/candidate-notes";
import { listCandidateSchedulesByCampaignApplied } from "@/lib/db/candidate-schedules";
import { listStageHistory } from "@/lib/db/candidate-stage-history";
import { listCvDetailVersionsByCampaignApplied } from "@/lib/db/cv-detail-versions";
import { getUsersByIds } from "@/lib/db/users";

export type ActivityItem = {
  text: string;
  by: string;
  at: string;
  human?: boolean;
  reason?: string;
};

export type ActivityEvent = {
  at: Date;
  text: string;
  /** user id, or null for system events. */
  userId: string | null;
  reason?: string | null;
};

const PAGE = 30;

/** Pure: sort events newest-first, paginate by ISO cursor (exclusive), resolve user names. */
export function mergeActivity(
  events: ActivityEvent[],
  names: Map<string, string>,
  cursor: string | null,
  limit = PAGE,
): { items: ActivityItem[]; nextCursor: string | null } {
  const before = cursor ? Date.parse(cursor) : Infinity;
  const sorted = events
    .filter((e) => e.at.getTime() < before)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  const page = sorted.slice(0, limit);
  const items = page.map<ActivityItem>((e) => ({
    text: e.text,
    by: e.userId ? (names.get(e.userId) ?? "Unknown user") : "System",
    at: e.at.toISOString(),
    human: e.userId != null,
    ...(e.reason ? { reason: e.reason } : {}),
  }));
  const nextCursor =
    sorted.length > limit ? page[page.length - 1].at.toISOString() : null;
  return { items, nextCursor };
}


const CV_EVENT_TEXT: Record<string, string> = {
  initial_upload: "uploaded CV",
  file_replaced: "replaced CV file",
  manual_edit: "edited CV fields",
  restore: "restored a CV version",
};

const SCHEDULE_TEXT: Record<string, string> = {
  Scheduled: "scheduled",
  Confirmed: "confirmed",
  Rescheduled: "rescheduled",
  Canceled: "canceled",
  Completed: "completed",
  NoShow: "marked no-show for",
};

/** Gathers every activity source for one application and returns one page. */
export async function getCandidateActivity(
  db: QueryExecutor,
  app: { id: string; created_at: Date },
  cursor: string | null,
): Promise<{ items: ActivityItem[]; nextCursor: string | null }> {
  const [versions, schedules, notes, history] = await Promise.all([
    listCvDetailVersionsByCampaignApplied(db, app.id),
    listCandidateSchedulesByCampaignApplied(db, app.id),
    listCandidateNotesByCampaignApplied(db, app.id),
    listStageHistory(db, app.id),
  ]);

  const events: ActivityEvent[] = [
    { at: app.created_at, text: "Application created", userId: null },
  ];
  for (const v of versions) {
    events.push({
      at: v.created_at,
      text: `${CV_EVENT_TEXT[v.source_event] ?? "updated CV"} (v${v.version_number})`,
      userId: v.created_by,
      reason: v.change_summary,
    });
  }
  for (const s of schedules) {
    events.push({
      at: s.created_at,
      text: `${SCHEDULE_TEXT[s.status] ?? "updated"} ${s.round_label ?? "interview"}`,
      userId: s.created_by,
    });
  }
  for (const n of notes) {
    events.push({
      at: n.created_at,
      text: `added ${n.type === "interview" ? "an interview" : n.type === "pre_interview" ? "a pre-interview" : "a"} note`,
      userId: n.author_id,
    });
  }
  for (const h of history) {
    const from = h.from_stage_name ?? "—";
    const to = h.to_stage_name ?? "—";
    events.push({
      at: h.at,
      text: from === to ? `Updated status in ${to}` : `Moved ${from} → ${to}`,
      userId: h.by_user_id,
      reason: h.reason,
    });
  }

  const ids = [...new Set(events.map((e) => e.userId).filter((x): x is string => !!x))];
  const users = await getUsersByIds(db, ids);
  const names = new Map(users.map((u) => [u.id, u.username]));
  return mergeActivity(events, names, cursor);
}
