"use client";

import React from "react";
import { Badge, Button, Icon } from "./ext";
import type { MyInterview } from "./api";
import { dayLong, isoDateInTz, minuteOfDayInTz, timeRange } from "../calendar-2/data";

const when = (m: MyInterview) =>
  `${dayLong(isoDateInTz(new Date(m.start)))} · ${timeRange(minuteOfDayInTz(new Date(m.start)), m.durationMin)}`;

const dueLabel = (m: MyInterview) =>
  new Date(m.evaluationDueAt).toLocaleString("en-GB", { timeZone: "Asia/Ho_Chi_Minh", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) + " (GMT+7)";

/** The viewer's interviews on one position, soonest first; evaluations still owed come first. */
/** BR-INT-09: a started session that is still active can be marked as no-show. */
export const canMarkNoShow = (m: MyInterview, now = Date.now()) =>
  (m.status === "Scheduled" || m.status === "Confirmed") && new Date(m.start).getTime() <= now;

export function MyInterviewsTab({ items, onOpenCandidate, onNoShow }: { items: MyInterview[]; onOpenCandidate: (caId: string) => void; onNoShow?: (m: MyInterview) => void }) {
  const rows = [...items].sort((a, b) =>
    Number(b.pendingEvaluation) - Number(a.pendingEvaluation) || a.start.localeCompare(b.start));
  if (rows.length === 0) {
    return <div style={{ padding: "48px 0", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>You have no interviews on this position.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((m) => (
        <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14, border: "1px solid var(--border, #e5e7eb)", borderRadius: 10 }}>
          <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <strong>{m.candidateName ?? "Candidate"}</strong>
            {m.round && <Badge tone="neutral">{m.round}</Badge>}
            {m.pendingEvaluation && <Badge tone={m.overdue ? "danger" : "warning"}>{m.overdue ? "Evaluation overdue" : "Evaluation due"}</Badge>}
            {m.upcoming && <Badge tone="info">Upcoming</Badge>}
          </span>
          <span className="shx-small"><Icon name="clock" size={13} /> {when(m)}</span>
          <span className="shx-small"><Icon name="map-pin" size={13} /> {m.mode === "office" ? m.location || "Office" : "Online"}
            {m.upcoming && m.meetingLink && <> · <a href={m.meetingLink} target="_blank" rel="noreferrer">Join meeting</a></>}
          </span>
          {m.organizerName && <span className="shx-small"><Icon name="user-check" size={13} /> Organized by {m.organizerName}</span>}
          {m.pendingEvaluation && <span className="shx-small"><Icon name="lock" size={12} /> Evaluation due {dueLabel(m)}. The AI match stays hidden until you submit.</span>}
          <span style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" onClick={() => onOpenCandidate(m.campaignAppliedId)}>{m.pendingEvaluation ? "Write evaluation" : "Open candidate"}</Button>
            {onNoShow && canMarkNoShow(m) && <Button variant="secondary" icon="user-x" onClick={() => onNoShow(m)}>Mark no-show</Button>}
          </span>
        </div>
      ))}
    </div>
  );
}
