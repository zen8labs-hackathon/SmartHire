import { createHash } from "node:crypto";

import type { QueryExecutor } from "@/lib/db/config/client";
import type { PlanIssue } from "@/lib/db/legacy-job-plan";

/**
 * Track B/C data that rides along with a per-job conversion: the hire type,
 * interview `mode` and "evaluation submitted" marks. Everything is proposed
 * by a read-only dry-run; whatever the system cannot decide on its own is
 * surfaced as a blocker until HR decides. Nothing is fabricated -- values
 * without a legacy source stay NULL.
 *
 * Busy-block `days` is deliberately NOT touched: the empty-array fallback
 * ("weekday of start_date") stays in the readers (decision: keep fallback).
 */

export const HIRE_TYPES = ["New hire", "Replacement"] as const;
export type HireType = (typeof HIRE_TYPES)[number];

/** Same map the legacy UI uses (components/admin/jd/dashboard/helpers.ts). */
const LEGACY_HIRE_TYPE_VI_TO_EN: Record<string, HireType> = {
  "Tuyển mới": "New hire",
  "Tuyển thay thế": "Replacement",
};

const normalize = (raw: string) => raw.trim().replace(/\s+/g, " ");

/** Proposes a hire type for a free-text legacy value; null when it cannot be mapped. */
export function proposeHireType(raw: string | null): HireType | null {
  if (!raw) return null;
  const t = normalize(raw);
  const exact = (HIRE_TYPES as readonly string[]).find((h) => h === t);
  if (exact) return exact as HireType;
  const vi = LEGACY_HIRE_TYPE_VI_TO_EN[t];
  if (vi) return vi;
  const lower = t.toLowerCase();
  return HIRE_TYPES.find((h) => h.toLowerCase() === lower) ?? null;
}

export type DataDecisions = {
  /** HR's pick when the legacy value cannot be mapped automatically. */
  hireType?: HireType;
  /**
   * Schedule ids HR approved as `office` out of the proposed list. Present
   * (even empty) means HR reviewed the list; absent leaves it unresolved.
   */
  officeScheduleIds?: string[];
  /** Per ambiguous review (by id): the seat HR picked, or null to skip it. */
  evaluationChoices?: Record<string, { scheduleId: string; profileId: string } | null>;
};

export type EvalSeat = { scheduleId: string; profileId: string };

export type EvaluationProposal = {
  reviewId: string;
  campaignAppliedId: string;
  submittedAt: string;
  /** auto = single unambiguous seat; ambiguous = HR must choose; none = nothing to mark. */
  kind: "auto" | "ambiguous" | "none";
  seat?: EvalSeat;
  options?: EvalSeat[];
};

export type DataPlan = {
  hireType: {
    current: string | null;
    proposed: HireType | null;
    final: HireType | null;
    needsDecision: boolean;
  };
  mode: {
    /** Heuristic exceptions: `location` set and no link, so likely `office`. */
    proposedOffice: { scheduleId: string; location: string; scheduledAt: string }[];
    approvedOffice: string[];
    needsReview: boolean;
    totalSchedules: number;
  };
  evaluations: {
    proposals: EvaluationProposal[];
    /** Seats that will be marked submitted, after HR decisions. */
    marks: (EvalSeat & { submittedAt: string })[];
  };
  blockers: PlanIssue[];
  warnings: PlanIssue[];
  fingerprint: string;
};

type ScheduleRow = {
  id: string; campaign_applied_id: string; scheduled_at: Date; status: string;
  location: string | null; mode: string; meeting_link: string | null;
};
type SeatRow = {
  schedule_id: string; profile_id: string; campaign_applied_id: string;
  scheduled_at: Date; status: string;
};
type ReviewRow = { id: string; campaign_applied_id: string; created_by: string | null; created_at: Date };

export type DataInputs = {
  hireType: string | null;
  schedules: ScheduleRow[];
  seats: SeatRow[];
  reviews: ReviewRow[];
};

export async function loadDataInputs(db: QueryExecutor, jobId: string): Promise<DataInputs> {
  const { rows: jobs } = await db.query<{ hire_type: string | null }>(
    `SELECT hire_type FROM jobs WHERE id = $1`,
    [jobId],
  );
  const { rows: schedules } = await db.query<ScheduleRow>(
    `SELECT cs.id::text AS id, cs.campaign_applied_id::text AS campaign_applied_id, cs.scheduled_at,
            cs.status, cs.location, cs.mode, cs.meeting_link
     FROM candidate_schedules cs
     JOIN campaign_applied ca ON ca.id = cs.campaign_applied_id
     WHERE ca.job_id = $1
     ORDER BY cs.id`,
    [jobId],
  );
  const { rows: seats } = await db.query<SeatRow>(
    `SELECT csi.schedule_id::text AS schedule_id, csi.profile_id::text AS profile_id,
            cs.campaign_applied_id::text AS campaign_applied_id, cs.scheduled_at, cs.status
     FROM candidate_schedule_interviewers csi
     JOIN candidate_schedules cs ON cs.id = csi.schedule_id
     JOIN campaign_applied ca ON ca.id = cs.campaign_applied_id
     WHERE ca.job_id = $1
       AND csi.declined_at IS NULL AND csi.evaluation_submitted_at IS NULL
       AND cs.status IN ('Scheduled', 'Confirmed', 'Completed', 'NoShow')
     ORDER BY csi.schedule_id, csi.profile_id`,
    [jobId],
  );
  const { rows: reviews } = await db.query<ReviewRow>(
    `SELECT r.id::text AS id, r.campaign_applied_id::text AS campaign_applied_id,
            r.created_by::text AS created_by, r.created_at
     FROM candidate_evaluation_reviews r
     JOIN campaign_applied ca ON ca.id = r.campaign_applied_id
     WHERE ca.job_id = $1 AND r.revoked_at IS NULL
     ORDER BY r.id`,
    [jobId],
  );
  return { hireType: jobs[0]?.hire_type ?? null, schedules, seats, reviews };
}

const ms = (d: Date | string) => new Date(d).getTime();

/**
 * A legacy PDF evaluation is written after the interview, so candidate seats
 * are those of the same application held at or before the review. When the
 * reviewer is known, only their own seats count. Exactly one seat -> auto;
 * several -> HR chooses; none -> nothing to mark.
 */
export function matchReview(review: ReviewRow, seats: SeatRow[]): EvaluationProposal {
  const base = {
    reviewId: review.id,
    campaignAppliedId: review.campaign_applied_id,
    submittedAt: new Date(review.created_at).toISOString(),
  };
  let pool = seats.filter(
    (s) => s.campaign_applied_id === review.campaign_applied_id && ms(s.scheduled_at) <= ms(review.created_at),
  );
  if (review.created_by && pool.some((s) => s.profile_id === review.created_by))
    pool = pool.filter((s) => s.profile_id === review.created_by);
  const options = pool.map((s) => ({ scheduleId: s.schedule_id, profileId: s.profile_id }));
  if (options.length === 0) return { ...base, kind: "none" };
  if (options.length === 1) return { ...base, kind: "auto", seat: options[0] };

  // Several seats: a single seat that is clearly nearest in time is still a guess,
  // so it goes to HR. Keep only the closest schedule's seats to keep the choice short.
  const nearest = Math.max(...pool.map((s) => ms(s.scheduled_at)));
  const closest = pool.filter((s) => ms(s.scheduled_at) === nearest);
  const closestOptions = closest.map((s) => ({ scheduleId: s.schedule_id, profileId: s.profile_id }));
  return { ...base, kind: "ambiguous", options: closestOptions.length > 0 ? closestOptions : options };
}

export function buildDataPlan(inputs: DataInputs, decisions: DataDecisions = {}): DataPlan {
  const blockers: PlanIssue[] = [];
  const warnings: PlanIssue[] = [];

  // --- hire type
  const current = inputs.hireType;
  const proposed = proposeHireType(current);
  const hasValue = !!current && current.trim().length > 0;
  const alreadyValid = proposed !== null && current === proposed;
  const final = decisions.hireType ?? proposed;
  const needsDecision = hasValue && proposed === null && !decisions.hireType;
  if (needsDecision)
    blockers.push({
      code: "HIRE_TYPE_UNMAPPED",
      message: `Hire type "${current}" cannot be mapped automatically. Choose New hire or Replacement.`,
    });
  if (!hasValue)
    warnings.push({ code: "HIRE_TYPE_EMPTY", message: "This job has no hire type; it stays empty." });

  // --- interview mode
  const activeSchedules = inputs.schedules;
  const proposedOffice = activeSchedules
    .filter((s) => s.mode === "online" && !!s.location?.trim() && !s.meeting_link?.trim())
    .map((s) => ({
      scheduleId: s.id,
      location: s.location!.trim(),
      scheduledAt: new Date(s.scheduled_at).toISOString(),
    }));
  const proposedIds = new Set(proposedOffice.map((p) => p.scheduleId));
  const approvedOffice = (decisions.officeScheduleIds ?? []).filter((id) => proposedIds.has(id));
  const needsReview = proposedOffice.length > 0 && decisions.officeScheduleIds === undefined;
  if (needsReview)
    blockers.push({
      code: "MODE_REVIEW_REQUIRED",
      message: `${proposedOffice.length} interview(s) have a location but no link. Review which ones are in-office.`,
    });
  for (const id of decisions.officeScheduleIds ?? [])
    if (!proposedIds.has(id))
      blockers.push({ code: "MODE_UNKNOWN_SCHEDULE", message: "An approved interview is not in the proposed list.", ref: id });

  // --- evaluation submitted
  const proposals = inputs.reviews.map((r) => matchReview(r, inputs.seats));
  const marks = new Map<string, EvalSeat & { submittedAt: string }>();
  const addMark = (seat: EvalSeat, submittedAt: string) => {
    const key = `${seat.scheduleId}:${seat.profileId}`;
    const prev = marks.get(key);
    if (!prev || ms(submittedAt) < ms(prev.submittedAt)) marks.set(key, { ...seat, submittedAt });
  };
  for (const p of proposals) {
    if (p.kind === "auto" && p.seat) addMark(p.seat, p.submittedAt);
    else if (p.kind === "ambiguous") {
      const choice = decisions.evaluationChoices?.[p.reviewId];
      if (choice === undefined)
        blockers.push({
          code: "EVALUATION_AMBIGUOUS",
          message: "A legacy evaluation matches several interviewers. Choose who submitted it, or skip it.",
          ref: p.reviewId,
        });
      else if (choice !== null) {
        const ok = (p.options ?? []).some((o) => o.scheduleId === choice.scheduleId && o.profileId === choice.profileId);
        if (!ok)
          blockers.push({ code: "EVALUATION_INVALID_CHOICE", message: "The chosen interviewer is not an option.", ref: p.reviewId });
        else addMark(choice, p.submittedAt);
      }
    } else if (p.kind === "none")
      warnings.push({
        code: "EVALUATION_NO_MATCH",
        message: "A legacy evaluation has no matching interview seat; nothing is marked.",
        ref: p.reviewId,
      });
  }

  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        current,
        final,
        proposedOffice: proposedOffice.map((p) => p.scheduleId),
        approvedOffice: [...approvedOffice].sort(),
        proposals: proposals.map((p) => [p.reviewId, p.kind, p.seat ?? null, p.options ?? null]),
        marks: [...marks.keys()].sort(),
      }),
    )
    .digest("hex");

  return {
    hireType: { current, proposed: alreadyValid ? proposed : proposed, final, needsDecision },
    mode: { proposedOffice, approvedOffice, needsReview, totalSchedules: activeSchedules.length },
    evaluations: { proposals, marks: [...marks.values()] },
    blockers,
    warnings,
    fingerprint,
  };
}

export type DataApplySnapshot = {
  previousHireType: string | null;
  officeScheduleIds: string[];
  evaluationSeats: EvalSeat[];
};

/** Runs inside the conversion transaction. Only writes what the plan resolved. */
export async function applyDataPlan(
  tx: QueryExecutor,
  jobId: string,
  plan: DataPlan,
): Promise<DataApplySnapshot> {
  const { hireType, mode, evaluations } = plan;

  if (hireType.final && hireType.final !== hireType.current)
    await tx.query(`UPDATE jobs SET hire_type = $2, updated_at = now() WHERE id = $1`, [jobId, hireType.final]);

  if (mode.approvedOffice.length > 0)
    await tx.query(
      `UPDATE candidate_schedules SET mode = 'office'
       WHERE id = ANY($1::bigint[]) AND mode = 'online'`,
      [mode.approvedOffice],
    );

  const written: EvalSeat[] = [];
  for (const m of evaluations.marks) {
    const { rows } = await tx.query(
      `UPDATE candidate_schedule_interviewers SET evaluation_submitted_at = $3
       WHERE schedule_id = $1::bigint AND profile_id = $2::uuid AND evaluation_submitted_at IS NULL
       RETURNING 1`,
      [m.scheduleId, m.profileId, m.submittedAt],
    );
    if (rows.length > 0) written.push({ scheduleId: m.scheduleId, profileId: m.profileId });
  }
  return { previousHireType: hireType.current, officeScheduleIds: mode.approvedOffice, evaluationSeats: written };
}
