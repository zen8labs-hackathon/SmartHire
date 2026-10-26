"use client";

/**
 * Shared interview scheduling dialog. Creates a round for a candidate (their
 * application and the round come from context) or reschedules an existing one,
 * checking conflicts against the interviewers' calendars as the time changes
 * and surfacing the server's 409 issues when the save is refused.
 */
import React from "react";
import {
  Banner, Button, Checkbox, Dialog, Icon, Input, Select,
} from "@/app/admin/position-management-2/ext";
import { fetchCalendar, saveSchedule, searchPeople } from "@/app/admin/calendar-2/api";
import {
  activeInterviewerIds, addDays, check, conflictContext, dayLong, fmtMin, fromLocal, hasBlocking, suggest,
  timeRange, todayInTz, weekStart,
  type CalendarFeed, type Issue, type PersonResult, type Session, type SessionMode,
} from "@/app/admin/calendar-2/data";
import "@/app/admin/calendar-2/cal.css";

const STEP = 15;
const LENGTHS = [30, 45, 60, 90, 120];
const MAX_LANES = 3; // the calendar API compares at most 3 people
const MAX_INTERVIEWERS = 10;
const FORWARD_WEEKS = 4;
const SEV: Record<Issue["level"], string> = { hard: "Blocks", soft: "Warning", info: "Note" };
const COL: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12 };

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export type ScheduleDialogProps = {
  campaignAppliedId: string;
  candidateName: string;
  /** Candidate key and job for the clash checks; the application id stands in when absent. */
  candidateKey?: string;
  jobId?: string;
  /** New round: label taken from the candidate's stage. */
  roundLabel?: string;
  /** Present -> reschedule this round. */
  existing?: Session;
  /** Interviewers pre-selected on a new round. */
  defaultInterviewers?: { id: string; name: string }[];
  onClose: () => void;
  /** Called after a successful save; the caller refreshes and shows `msg`. */
  onDone: (msg: string) => void;
};

export function ScheduleDialog({
  campaignAppliedId, candidateName, candidateKey, jobId, roundLabel, existing, defaultInterviewers, onClose, onDone,
}: ScheduleDialogProps) {
  const resched = !!existing;
  const now = React.useMemo(() => new Date(), []);
  const today = todayInTz(now);

  const [date, setDate] = React.useState(existing?.date ?? today);
  const [startMin, setStartMin] = React.useState(existing?.startMin ?? 10 * 60);
  const [len, setLen] = React.useState(existing?.durationMin ?? 60);
  const [mode, setMode] = React.useState<SessionMode>(existing?.mode ?? "online");
  const [location, setLocation] = React.useState(existing?.location ?? "");
  const [link, setLink] = React.useState(existing?.meetingLink ?? "");
  const [note, setNote] = React.useState(existing?.note ?? "");
  const [reason, setReason] = React.useState("");
  const [ivs, setIvs] = React.useState<{ id: string; name: string }[]>(defaultInterviewers ?? []);
  const [ack, setAck] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [server, setServer] = React.useState<Issue[] | null>(null);
  const [feed, setFeed] = React.useState<CalendarFeed | null>(null);
  const [feedErr, setFeedErr] = React.useState<string | null>(null);

  const ivIds = React.useMemo(
    () => (existing ? activeInterviewerIds(existing) : ivs.map((p) => p.id)),
    [existing, ivs],
  );
  const laneKey = ivIds.slice(0, MAX_LANES).join(",");

  React.useEffect(() => {
    const ac = new AbortController();
    const from = today;
    const to = addDays(weekStart(today), (FORWARD_WEEKS + 1) * 7 - 1);
    fetchCalendar({ from, to, people: laneKey ? laneKey.split(",") : [] }, ac.signal).then(
      (f) => { setFeed(f); setFeedErr(null); },
      (e: unknown) => { if (!ac.signal.aborted) setFeedErr(errText(e, "Could not load calendars.")); },
    );
    return () => ac.abort();
  }, [today, laneKey]);

  const ctx = React.useMemo(() => (feed ? conflictContext(feed, { now }) : null), [feed, now]);
  const base = React.useMemo(() => ({
    durationMin: len,
    interviewerIds: ivIds,
    candidateKey: candidateKey ?? existing?.candidateId ?? campaignAppliedId,
    jobId: jobId ?? existing?.jobId ?? "",
    excludeId: existing?.id,
  }), [len, ivIds, candidateKey, existing, campaignAppliedId, jobId]);

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today;
  const local = React.useMemo(
    () => (valid && ctx ? check({ ...base, start: fromLocal(date, startMin) }, ctx) : []),
    [valid, ctx, base, date, startMin],
  );
  const sugs = React.useMemo(() => (ctx ? suggest(base, ctx, 4) : []), [base, ctx]);
  const issues = server ?? local;
  const hasSoft = issues.some((i) => i.level === "soft");
  const timeChanged = !existing || date !== existing.date || startMin !== existing.startMin || len !== existing.durationMin;
  const r = reason.trim();
  const needReason = resched && timeChanged;
  const detailChanged = !existing
    || mode !== (existing.mode ?? "online") || location !== (existing.location ?? "")
    || link !== (existing.meetingLink ?? "") || note !== (existing.note ?? "");
  const missingIv = !existing && !ivIds.length;
  const missingLocation = mode === "office" && !location.trim();
  const blocked = !valid || !ctx || missingIv || missingLocation || (!timeChanged && !detailChanged) || (needReason && !r) || (timeChanged && hasBlocking(issues, ack));

  const pick = (d: string, s: number) => { setServer(null); setAck(false); setDate(d); setStartMin(s); };
  const starts = React.useMemo(() => {
    const xs = new Set<number>();
    for (let m = 6 * 60; m <= 22 * 60; m += STEP) xs.add(m);
    xs.add(startMin);
    return [...xs].sort((a, b) => a - b).map((m) => ({ value: String(m), label: fmtMin(m) }));
  }, [startMin]);
  const lengths = [...new Set([...LENGTHS, existing?.durationMin ?? 60, len])].sort((a, b) => a - b)
    .map((m) => ({ value: String(m), label: `${m} min` }));

  const save = () => {
    setBusy(true);
    setErr(null);
    saveSchedule(campaignAppliedId, {
      scheduledAt: fromLocal(date, startMin),
      durationMinutes: len,
      mode,
      location: mode === "office" ? location.trim() : "",
      meetingLink: mode === "online" ? link.trim() : "",
      note: note.trim(),
      ...(existing
        ? { scheduleId: existing.id, ...(needReason ? { reason: r } : {}) }
        : { roundLabel, interviewerIds: ivIds }),
      acknowledgeSoft: ack,
    }).then(
      (res) => {
        if (res.ok) {
          onDone(resched
            ? `Rescheduled to ${dayLong(date)} · ${timeRange(startMin, len)}.`
            : `Scheduled ${roundLabel ?? "interview"} for ${candidateName} on ${dayLong(date)} · ${timeRange(startMin, len)}.`);
          return;
        }
        setBusy(false);
        setServer(res.issues);
      },
      (e: unknown) => { setBusy(false); setErr(errText(e, "Could not save the interview.")); },
    );
  };

  const title = resched ? "Reschedule interview" : roundLabel ? `Schedule ${roundLabel}` : "Schedule interview";
  return (
    <Dialog title={title} description={candidateName} width={600} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button icon="calendar-clock" disabled={busy || blocked} onClick={save}>{resched ? "Reschedule" : "Schedule"}</Button></>}>
      <div style={COL}>
        {err && <Banner tone="danger" title={err} />}
        {feedErr && <Banner tone="warning" title="Couldn’t check calendars">{feedErr}</Banner>}
        {existing && <span className="shx-small">Was {dayLong(existing.date)} · {timeRange(existing.startMin, existing.durationMin)}</span>}
        {!resched && roundLabel && <span className="shx-small">Round: {roundLabel}</span>}

        {!resched && (
          <InterviewerPicker scope={{ campaignAppliedId, jobId }} picked={ivs} onAdd={(p) => setIvs((xs) => (xs.some((x) => x.id === p.id) ? xs : [...xs, { id: p.id, name: p.name }]))}
            onRemove={(id) => { setServer(null); setIvs((xs) => xs.filter((x) => x.id !== id)); }} />
        )}

        <div className="sc-2">
          <Input label="Date" type="date" value={date} min={today} onChange={(e) => pick(e.target.value, startMin)} />
          <div className="sc-2">
            <Select label="Start" value={String(startMin)} options={starts} onChange={(e) => pick(date, Number(e.target.value))} />
            <Select label="Length" value={String(len)} options={lengths} onChange={(e) => { setServer(null); setLen(Number(e.target.value)); }} />
          </div>
        </div>

        {valid && (
          <div className="sc-top">
            <span className="sc-when">{dayLong(date)} · {timeRange(startMin, len)}</span>
            {ctx && timeChanged && !issues.length && <span className="sc-sev sc-sev--ok"><Icon name="check" size={12} /> Everyone is free</span>}
          </div>
        )}
        {timeChanged && issues.length > 0 && (
          <div className="sc-checks">
            {issues.map((i, n) => (
              <div className="sc-check" key={n}>
                <span className={`sc-sev sc-sev--${i.level}`}>{SEV[i.level]}</span>
                <span>{i.text}</span>
              </div>
            ))}
          </div>
        )}
        {timeChanged && hasSoft && !issues.some((i) => i.level === "hard") && (
          <Checkbox checked={ack} onChange={(e) => setAck(e.target.checked)} label="Schedule anyway — I’ve checked the warnings." />
        )}
        {sugs.length > 0 && (
          <div className="sc-field">
            <span className="sc-label">Suggested times</span>
            <div className="sc-sugs">
              {sugs.map((g) => (
                <button type="button" key={`${g.date}-${g.startMin}`} onClick={() => pick(g.date, g.startMin)}
                  className={"sc-sug" + (g.date === date && g.startMin === startMin ? " is-on" : "")}>
                  {dayLong(g.date)} · {fmtMin(g.startMin)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="sc-field">
          <span className="sc-label">Format</span>
          <div className="sc-seg" role="group" aria-label="Interview format">
            <button type="button" aria-pressed={mode === "online"} onClick={() => setMode("online")}><Icon name="video" size={14} /> Online</button>
            <button type="button" aria-pressed={mode === "office"} onClick={() => setMode("office")}><Icon name="map-pin" size={14} /> In office</button>
          </div>
        </div>
        {mode === "online"
          ? <Input label="Meeting link" value={link} placeholder="https://…" onChange={(e) => setLink(e.target.value)} />
          : <Input label="Location" value={location} placeholder="Room or address" hint="Required for in-office interviews." onChange={(e) => setLocation(e.target.value)} />}
        <label className="sc-field">
          <span className="sc-label">Note for interviewers</span>
          <textarea className="sc-ta" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </label>
        {needReason && (
          <label className="sc-field">
            <span className="sc-label">Reason for rescheduling</span>
            <textarea className="sc-ta" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Shared with the candidate and interviewers" />
          </label>
        )}
      </div>
    </Dialog>
  );
}

function InterviewerPicker({ picked, scope, onAdd, onRemove }: {
  scope: { campaignAppliedId?: string; jobId?: string };
  picked: { id: string; name: string }[];
  onAdd: (p: PersonResult) => void;
  onRemove: (id: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const [focus, setFocus] = React.useState(false);
  const [res, setRes] = React.useState<{ q: string; items: PersonResult[]; error?: string } | null>(null);
  const term = q.trim();
  React.useEffect(() => {
    if (!term) return;
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      searchPeople(term, ac.signal, scope).then(
        (items) => setRes({ q: term, items }),
        (e: unknown) => { if (!ac.signal.aborted) setRes({ q: term, items: [], error: errText(e, "Could not search people.") }); },
      );
    }, 250);
    return () => { window.clearTimeout(t); ac.abort(); };
  }, [term, scope.campaignAppliedId, scope.jobId]);
  const full = picked.length >= MAX_INTERVIEWERS;
  const ready = res?.q === term;
  const list = ready
    ? res.items.filter((p) => !picked.some((x) => x.id === p.id))
      .sort((a, b) => Number(!!b.onPosition) - Number(!!a.onPosition) || Number(b.sameChapter) - Number(a.sameChapter) || a.name.localeCompare(b.name)).slice(0, 8)
    : [];
  return (
    <div className="sc-field">
      <span className="sc-label">Interviewers</span>
      <div className="cl-pick">
          <Input size="sm" icon="search" value={q} disabled={full} aria-label="Add interviewer"
            placeholder={full ? `Up to ${MAX_INTERVIEWERS}` : "Add interviewer…"} style={{ width: "100%" }}
            onChange={(e) => setQ(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
            onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }} />
          {focus && term && !full && (
            <div className="cl-pmenu" role="listbox">
              {!ready ? <span className="shx-small">Searching…</span>
                : res.error ? <span className="shx-small">{res.error}</span>
                : !list.length ? <span className="shx-small">No one found.</span>
                : list.map((p) => (
                  <button type="button" role="option" aria-selected={false} key={p.id}
                    onMouseDown={(e) => e.preventDefault()} onClick={() => { onAdd(p); setQ(""); }}>
                    <b>{p.name}</b>
                    <span className="shx-small">{p.email}{p.onPosition ? " · on this position" : p.sameChapter ? " · your chapter" : ""}</span>
                  </button>
                ))}
            </div>
          )}
        </div>
      {picked.length > 0 && (
        <div className="cl-people">
        {picked.map((p) => (
          <span key={p.id} className="cl-pchip" title={p.name}>
            <Icon name="user" size={13} style={{ color: "var(--muted)" }} />{p.name}
            <button type="button" aria-label={`Remove ${p.name}`} onClick={() => onRemove(p.id)}><Icon name="x" size={12} /></button>
          </span>
        ))}
        </div>
      )}
      {!picked.length && <span className="shx-small">Required — add at least one interviewer.</span>}
      {picked.length > MAX_LANES && <span className="shx-small">Calendars are checked for the first {MAX_LANES}; the rest are verified on save.</span>}
    </div>
  );
}
