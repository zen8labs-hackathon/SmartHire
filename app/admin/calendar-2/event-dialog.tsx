"use client";

import React from "react";
import { Badge, Banner, Button, Dialog, Icon, type Tone } from "../position-management-2/ext";
import { ScheduleDialog } from "@/app/admin/calendar-2/schedule-dialog";
import { declineSession, withdrawDecline } from "./api";
import {
  STATUS_LABEL, dayLong, isUpcoming, seatOf, timeRange,
  type CalendarFeed, type Session, type SessionStatus,
} from "./data";

/** Candidate and position pages live in Position Management 2. */
const PM2 = "/admin/position-management-2";

const COL: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12 };

export const STATUS_TONE: Record<SessionStatus, Tone> = {
  Scheduled: "info", Confirmed: "success", Rescheduled: "neutral", Canceled: "neutral", Completed: "neutral", NoShow: "warning",
};

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

type View = "info" | "decline" | "reschedule";

type Props = {
  x: Session;
  title: string;
  /** Viewer organized it without sitting on it. */
  organized: boolean;
  /** Viewer may see job details (location, link, note). */
  see: boolean;
  feed: CalendarFeed;
  me: string;
  now: Date;
  onClose: () => void;
  /** Called after a successful change; the caller refreshes the feed and shows `msg`. */
  onDone: (msg: string) => void;
};

/** Interview details plus decline/withdraw for interviewers and reschedule for editors. Cancel lives in Position (BR-05-08). */
export function EventDialog({ x, title, organized, see, feed, me, now, onClose, onDone }: Props) {
  const [view, setView] = React.useState<View>("info");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const seat = seatOf(x, me);
  const upcoming = isUpcoming(x, now);
  const editable = x.canEdit && upcoming;
  const when = `${dayLong(x.date)} · ${timeRange(x.startMin, x.durationMin)}`;
  const go = (v: View) => { setErr(null); setView(v); };

  const run = (p: Promise<string>) => {
    setBusy(true);
    setErr(null);
    p.then(onDone, (e: unknown) => { setBusy(false); setErr(errText(e, "Something went wrong.")); });
  };

  if (view === "decline") {
    return <DeclineView title={title} when={when} busy={busy} err={err} onBack={() => go("info")}
      onSubmit={(reason) => run(declineSession(x.id, reason || undefined).then((r) =>
        r.noInterviewer ? "Declined. No interviewers are left — the organizer was told." : "Declined. The organizer was told."))} />;
  }
  if (view === "reschedule") {
    return <ScheduleDialog campaignAppliedId={x.campaignAppliedId} candidateName={title} candidateKey={x.candidateId ?? undefined}
      jobId={x.jobId ?? undefined} existing={x} onClose={() => go("info")} onDone={onDone} />;
  }

  const nameOf = (id: string) => feed.people.find((p) => p.id === id)?.name ?? "Someone";
  const declinedOthers = x.interviewers.filter((s) => s.declinedAt && s.id !== me);

  const footer = (
    <>
      {seat && upcoming && x.status === "Scheduled" && (seat.declinedAt
        ? <Button variant="ghost" icon="undo-2" disabled={busy} style={{ marginRight: "auto" }}
          onClick={() => run(withdrawDecline(x.id).then(() => "Decline withdrawn. The organizer was told you’re attending."))}>Withdraw decline</Button>
        : <Button variant="ghost" icon="calendar-x" disabled={busy} style={{ marginRight: "auto" }} onClick={() => go("decline")}>Can’t attend</Button>)}
      <Button variant="secondary" onClick={onClose}>Close</Button>
      {editable && <Button icon="calendar-clock" disabled={busy} onClick={() => go("reschedule")}>Reschedule</Button>}
    </>
  );

  return (
    <Dialog title={title} description={when} width={520} onClose={onClose} footer={footer}>
      <div style={COL}>
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Badge tone={STATUS_TONE[x.status]}>{STATUS_LABEL[x.status]}</Badge>
          {organized && <Badge tone="neutral">You organized</Badge>}
          {seat?.declinedAt && <Badge tone="warning">You declined</Badge>}
        </span>
        {err && <Banner tone="danger" title={err} />}
        {x.noInterviewer && (
          <Banner tone="danger" icon="user-x" title="No interviewers left">
            {x.canEdit ? "Everyone declined. Reschedule or add an interviewer from the candidate’s timeline." : "Everyone declined. The organizer has been told."}
          </Banner>
        )}
        {!x.noInterviewer && declinedOthers.map((s) => (
          <Banner key={s.id} tone="warning" title={`${nameOf(s.id)} can’t attend`}>{s.declineReason || "No reason given."}</Banner>
        ))}
        <div className="sc-box">
          <span className="sc-label">Interviewers</span>
          {x.interviewers.length === 0 && <span className="shx-small">None assigned.</span>}
          {x.interviewers.map((s) => (
            <span key={s.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="user" size={13} style={{ color: "var(--muted)" }} />
              <span style={s.declinedAt ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>
                {nameOf(s.id)}{s.id === me ? " (you)" : ""}
              </span>
              {s.declinedAt && <Badge tone="warning">Declined</Badge>}
              {s.submitted && <Badge tone="success">Feedback in</Badge>}
            </span>
          ))}
          {x.organizerId === me && !seat && (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="user" size={13} style={{ color: "var(--muted)" }} />
              <span>{nameOf(me)} (you · not attending)</span>
            </span>
          )}
        </div>
        {see ? (
          <div className="sc-box sc-box--sub">
            {x.jobId && (
              <span style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <a href={`${PM2}/${encodeURIComponent(x.jobId)}/${encodeURIComponent(x.campaignAppliedId)}`}>
                  <Icon name="user" size={14} /> Open candidate
                </a>
                <a href={`${PM2}/${encodeURIComponent(x.jobId)}`}><Icon name="briefcase" size={14} /> Open position</a>
              </span>
            )}
            <span><Icon name="map-pin" size={14} /> {x.mode === "office" ? x.location || "Office" : "Online"}</span>
            {x.meetingLink
              ? <a href={x.meetingLink} target="_blank" rel="noreferrer"><Icon name="video" size={14} /> Join meeting</a>
              : <span className="shx-small"><Icon name="video" size={14} /> No meeting link yet</span>}
            <span><Icon name="user-check" size={14} /> Organized by {x.organizerId === me ? "you" : nameOf(x.organizerId)}</span>
            <span className="shx-small"><Icon name="clock" size={14} /> Evaluation due {dueLabel(x.end)}</span>
            {seat && !seat.declinedAt && !seat.submitted && x.organizerId !== me && (
              <span className="shx-small"><Icon name="lock" size={12} /> AI match is hidden until you submit your evaluation.</span>
            )}
            {x.note && <span className="shx-small">{x.note}</span>}
          </div>
        ) : (
          <span className="shx-small"><Icon name="lock" size={12} /> Position details are only shown to people on the hiring team.</span>
        )}
      </div>
    </Dialog>
  );
}

/** Evaluations are due 24 real hours after the interview ends (GMT+7). */
function dueLabel(end: Date): string {
  const due = new Date(end.getTime() + 24 * 3600_000);
  return due.toLocaleString("en-GB", { timeZone: "Asia/Ho_Chi_Minh", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) + " (GMT+7)";
}

function DeclineView({ title, when, busy, err, onBack, onSubmit }: {
  title: string; when: string; busy: boolean; err: string | null; onBack: () => void; onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = React.useState("");
  return (
    <Dialog title="Can’t attend?" description={`${title} · ${when}`} onClose={onBack}
      footer={<><Button variant="secondary" onClick={onBack}>Back</Button><Button disabled={busy} onClick={() => onSubmit(reason.trim())}>Notify organizer</Button></>}>
      <div style={COL}>
        {err && <Banner tone="danger" title={err} />}
        <label className="sc-field">
          <span className="sc-label">Reason (optional)</span>
          <textarea className="sc-ta" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Out sick" autoFocus />
        </label>
        <span className="shx-small">The organizer is asked to find a replacement or move the interview.</span>
      </div>
    </Dialog>
  );
}
