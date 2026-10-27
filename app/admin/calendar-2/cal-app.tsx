"use client";

import React from "react";
import { Shell, Toast, type ToastMsg } from "../position-management-2/shell";
import type { Role } from "../position-management-2/data";
import { Badge, Banner, Button, Dialog, Icon, Input } from "../position-management-2/ext";
import { fetchCalendar, searchPeople } from "./api";
import { BusyDialog, type BusyDone, type BusyMode } from "./busy-dialog";
import { EventDialog, STATUS_TONE } from "./event-dialog";
import { HoursDialog } from "./hours-dialog";
import {
  STATUS_LABEL, activeInterviewerIds, addDays, dayLong, dayNum, dayShort, diffDays, fmtMin, fromLocal, givenName, isUpcoming,
  isWorkingDay, minuteOfDayInTz, mon, rangeLabel, seatOf, timeRange, todayInTz, weekStart,
  type BusyOccurrence, type CalendarFeed, type Hours, type LaneItem, type PersonResult, type Session, type SessionStatus,
} from "./data";

const DAY = 24 * 60;
/** The current week plus four ahead; the feed refuses anything later. */
const WEEKS = 5;
/** How many past weeks the week view can step back to (read-only history). */
const MAX_PAST_WEEKS = 26;
const MAX_PEOPLE = 3;
/** Mirrors DEFAULT_WORKING_HOURS until the feed arrives. */
const FALLBACK_HOURS: Hours = { days: [1, 2, 3, 4, 5], start: 510, end: 1050 };
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HIDDEN: ReadonlySet<SessionStatus> = new Set(["Rescheduled", "Canceled"]);

export type Ev =
  | { kind: "busy"; b: BusyOccurrence; date: string; s: number; e: number; all: boolean; own: boolean }
  | { kind: "iv"; x: Session; date: string; s: number; e: number; organized: boolean; see: boolean; declined: boolean };

/** A session as one of `me`'s events. */
function ivEv(x: Session, me: string): Ev {
  const seat = seatOf(x, me);
  const org = x.organizerId === me;
  return {
    kind: "iv", x, date: x.date, s: x.startMin, e: x.startMin + x.durationMin,
    organized: org && !seat, see: !x.limited, declined: !!seat && !!seat.declinedAt,
  };
}

/** The viewer's own events per date: busy time plus sessions they have a seat on (declined too) or organized. */
function eventsByDate(feed: CalendarFeed | null): Map<string, Ev[]> {
  const out = new Map<string, Ev[]>();
  if (!feed) return out;
  const push = (ev: Ev) => {
    const l = out.get(ev.date);
    if (l) l.push(ev);
    else out.set(ev.date, [ev]);
  };
  for (const b of feed.busy) {
    push({
      kind: "busy", b, date: b.date, all: b.allDay, own: b.ownerId === feed.me,
      s: b.allDay ? 0 : (b.fromMin ?? 0), e: b.allDay ? DAY : (b.toMin ?? DAY),
    });
  }
  for (const x of feed.sessions) {
    if (HIDDEN.has(x.status)) continue;
    if (!seatOf(x, feed.me) && x.organizerId !== feed.me) continue;
    push(ivEv(x, feed.me));
  }
  for (const l of out.values()) l.sort((a, b) => a.s - b.s);
  return out;
}

export const evTitle = (ev: Ev) =>
  ev.kind === "busy"
    ? (ev.own ? ev.b.note || "Busy" : "Busy")
    : ev.see ? `${ev.x.round ?? "Interview"} · ${ev.x.candidateName ?? "Candidate"}` : "Interview";
const evKind = (e: Ev) => (e.kind === "busy" ? "busy" : e.organized ? "org" : "iv");
const roomOf = (x: Session) => (x.mode === "office" ? (x.location ?? "").split(" · ")[0] || "Office" : "Online");
const evTime = (e: Ev) => (e.kind === "busy" && e.all ? "All day" : `${fmtMin(e.s)}–${fmtMin(Math.min(e.e, DAY))}`);

type Clock = { today: string; nowMin: number };
const isPast = (ev: Ev, { today, nowMin }: Clock) => ev.date < today || (ev.date === today && ev.e <= nowMin);
const evState = (ev: Ev, clock: Clock) =>
  (isPast(ev, clock) ? " is-past" : "") + (ev.kind === "iv" && ev.declined ? " is-declined" : "");

export type Lane = { id: string; name: string; items: LaneItem[] };

/** A compared person's busy/interview items clipped to one GMT+7 day, as minutes. */
function laneDay(items: LaneItem[], date: string): { kind: LaneItem["kind"]; s: number; e: number }[] {
  const d0 = fromLocal(date, 0).getTime();
  const d1 = fromLocal(addDays(date, 1), 0).getTime();
  const out = [];
  for (const it of items) {
    const a = Math.max(it.start.getTime(), d0), b = Math.min(it.end.getTime(), d1);
    if (a < b) out.push({ kind: it.kind, s: Math.round((a - d0) / 60_000), e: Math.round((b - d0) / 60_000) });
  }
  return out;
}

function CalGrid({ days, evs, hours, clock, dim, lanes = [], onRange, onOpen, k = 0.9 }: {
  days: string[]; evs: Map<string, Ev[]>; hours: Hours; clock: Clock; dim: boolean; k?: number; lanes?: Lane[];
  onRange: (date: string, s: number, e: number) => void; onOpen: (ev: Ev) => void;
}) {
  const { today, nowMin } = clock;
  const H0 = Math.min(480, Math.floor(hours.start / 60) * 60);
  const H1 = Math.max(1140, Math.ceil(hours.end / 60) * 60);
  const y = (m: number) => (Math.max(H0, Math.min(H1, m)) - H0) * k;
  const [drag, setDrag] = React.useState<{ d: string; a: number; b: number } | null>(null);
  const at = (e: React.MouseEvent, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return Math.max(H0, Math.min(H1 - 30, H0 + Math.floor((e.clientY - r.top) / k / 30) * 30));
  };
  const onRangeRef = React.useRef(onRange);
  React.useEffect(() => {
    onRangeRef.current = onRange;
  }, [onRange]);
  React.useEffect(() => {
    if (!drag) return;
    const up = () => {
      const a = Math.min(drag.a, drag.b), b = Math.max(drag.a, drag.b) + 30;
      setDrag(null);
      onRangeRef.current(drag.d, a, a === b - 30 ? a + 60 : b);
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [drag]);
  const hrs: number[] = [];
  for (let h = H0 / 60; h < H1 / 60; h++) hrs.push(h);
  const cols = `repeat(${days.length},minmax(0,1fr))`;
  const L = lanes.length + 1;
  const ownRight = L === 1 ? 2 : `calc(${((L - 1) / L) * 100}% + 2px)`;
  return (
    <div className="sc-grid cl-grid" aria-busy={dim} style={dim ? { opacity: 0.6 } : undefined}>
      <div className={"sc-gh" + (lanes.length ? " cl-lanes" : "")} style={{ gridTemplateColumns: `52px ${cols}` }}>
        <span />
        {days.map((d) => (
          <span key={d} className={d === today ? "is-today" : !isWorkingDay(d, hours) ? "is-we" : ""}>
            <span className="cl-dow">{dayShort(d)}</span> <b className={"cl-dn" + (d === today ? " is-today" : "")}>{dayNum(d)}</b>
            {lanes.length > 0 && (
              <span className="cl-lanehead"><i>You</i>{lanes.map((l) => <i key={l.id} title={l.name}>{givenName(l.name)}</i>)}</span>
            )}
          </span>
        ))}
      </div>
      <div className="sc-gb" style={{ gridTemplateColumns: `52px ${cols}`, height: (H1 - H0) * k }}>
        <div className="sc-tl">{hrs.map((h) => <span key={h} style={{ top: y(h * 60) }}>{h}:00</span>)}</div>
        {days.map((d) => {
          const past = d < today;
          return (
            <div key={d} className="sc-col cl-col" style={{ backgroundSize: `100% ${60 * k}px` }}
              onMouseDown={past ? undefined : (e) => { if (e.button !== 0) return; e.preventDefault(); const m = at(e, e.currentTarget); setDrag({ d, a: m, b: m }); }}
              onMouseMove={past ? undefined : (e) => { if (drag && drag.d === d) { const m = at(e, e.currentTarget); if (m !== drag.b) setDrag({ ...drag, b: m }); } }}>
              {!isWorkingDay(d, hours) ? <i className="sc-off" style={{ top: 0, bottom: 0 }} /> : (
                <>
                  <i className="sc-off" style={{ top: 0, height: y(hours.start) }} />
                  <i className="sc-off" style={{ top: y(hours.end), bottom: 0 }} />
                </>
              )}
              {past && <i className="sc-past" style={{ height: "100%" }} />}
              {d === today && (<><i className="sc-past" style={{ height: y(nowMin) }} /><i className="cl-now" style={{ top: y(nowMin) }} /></>)}
              {(evs.get(d) ?? []).map((ev, j) => {
                const top = Math.min(y(ev.s), (H1 - H0) * k - 18);
                return (
                  <button type="button" key={j}
                    className={`cl-ev cl-ev--${evKind(ev)}${evState(ev, clock)}`}
                    style={{ left: 2, right: ownRight, top, height: Math.max(18, y(ev.e) - top - 2) }}
                    onMouseDown={(e) => e.stopPropagation()} onClick={() => onOpen(ev)} title={evTitle(ev)}>
                    <b>{evTime(ev)}</b><span>{evTitle(ev)}</span>
                    {ev.kind === "iv" && ev.see && (ev.e - ev.s) * k > 52 && <small>{roomOf(ev.x)}{ev.organized ? " · you organized" : ""}</small>}
                  </button>
                );
              })}
              {lanes.map((l, i) => laneDay(l.items, d).map((it, j) => {
                const top = Math.min(y(it.s), (H1 - H0) * k - 18);
                const label = it.kind === "busy" ? "Busy" : "Interview";
                return (
                  <div key={`${l.id}-${j}`} aria-label={`${l.name}: ${label} ${fmtMin(it.s)}–${fmtMin(it.e)}`}
                    title={`${l.name} · ${label} · ${fmtMin(it.s)}–${fmtMin(it.e)}`}
                    className={`cl-ev cl-ev--${it.kind === "busy" ? "busy" : "iv"} cl-ev--lane`}
                    style={{ left: `calc(${((i + 1) / L) * 100}% + 2px)`, width: `calc(${100 / L}% - 4px)`, top, height: Math.max(18, y(it.e) - top - 2) }}>
                    <span>{label}</span>
                  </div>
                );
              }))}
              {drag && drag.d === d && (
                <div className="sc-sel cl-drag" style={{ top: y(Math.min(drag.a, drag.b)), height: (Math.abs(drag.b - drag.a) + 30) * k }}>
                  <b>{fmtMin(Math.min(drag.a, drag.b))}–{fmtMin(Math.max(drag.a, drag.b) + 30)}</b> · Mark as busy
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthView({ base, evs, hours, clock, dim, onDay, onOpen }: {
  base: string; evs: Map<string, Ev[]>; hours: Hours; clock: Clock; dim: boolean;
  onDay: (date: string) => void; onOpen: (ev: Ev) => void;
}) {
  const { today } = clock;
  const cells = Array.from({ length: WEEKS * 7 }, (_, i) => addDays(base, i));
  return (
    <div className="cl-month" aria-busy={dim} style={dim ? { opacity: 0.6 } : undefined}>
      {WD.map((x) => <div key={x} className="cl-mh">{x}</div>)}
      {cells.map((d) => {
        const ev = evs.get(d) ?? [];
        return (
          <div key={d} className={"cl-mc" + (mon(d) === mon(today) ? "" : " is-out") + (d === today ? " is-today" : "") + (isWorkingDay(d, hours) ? "" : " is-we")}>
            <button type="button" className="cl-mn" onClick={() => onDay(d)} aria-label={"Open " + dayLong(d)}>{dayNum(d)}</button>
            {ev.slice(0, 3).map((e, i) => (
              <button type="button" key={i} className={"cl-mev cl-mev--" + evKind(e) + evState(e, clock)} onClick={() => onOpen(e)}>
                {e.kind === "busy" && e.all ? "All day" : fmtMin(e.s)} {evTitle(e)}
              </button>
            ))}
            {ev.length > 3 && <button type="button" className="cl-more" onClick={() => onDay(d)}>+{ev.length - 3} more</button>}
          </div>
        );
      })}
    </div>
  );
}

function ListView({ to, evs, clock, dim, onOpen }: { to: string; evs: Map<string, Ev[]>; clock: Clock; dim: boolean; onOpen: (ev: Ev) => void }) {
  const { today, nowMin } = clock;
  const days: [string, Ev[]][] = [];
  for (let d = today; d <= to; d = addDays(d, 1)) {
    const ev = (evs.get(d) ?? []).filter((e) => !(d === today && e.e <= nowMin));
    if (ev.length) days.push([d, ev]);
  }
  if (!days.length) {
    return <div className="jb-empty"><Icon name="calendar" size={20} /><b>Nothing coming up</b><span>Interviews you attend or organize appear here.</span></div>;
  }
  return (
    <div className="cl-list" aria-busy={dim} style={dim ? { opacity: 0.6 } : undefined}>
      {days.map(([d, ev]) => (
        <section key={d} className="cl-lday">
          <header>
            <b>{dayLong(d)}</b>{d === today && <Badge tone="brand">Today</Badge>}
            <span className="shx-small">{ev.filter((e) => e.kind === "iv").length} interviews</span>
          </header>
          {ev.map((e, i) => (
            <button type="button" key={i} className="cl-lrow" onClick={() => onOpen(e)}>
              <span className="cl-ltime">{evTime(e)}</span>
              <i className={"cl-dot cl-dot--" + evKind(e)} />
              <span className="cl-lmain">
                <b>{evTitle(e)}</b>
                <span className="shx-small">
                  {e.kind === "busy"
                    ? "Only you see the note"
                    : `${e.see && e.x.jobId ? `Position #${e.x.jobId} · ` : ""}${roomOf(e.x)}${e.organized ? " · you organized, not attending" : ""}`}
                </span>
              </span>
              {e.kind === "iv" && <Badge tone={STATUS_TONE[e.x.status]}>{STATUS_LABEL[e.x.status]}</Badge>}
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

function hoursLabel(h: Hours): string {
  const ds = [...h.days].sort((a, b) => a - b);
  if (!ds.length) return "No working days";
  const run = ds.length > 1 && ds.every((x, i) => i === 0 || x === ds[i - 1] + 1);
  const days = run ? `${WD[ds[0] - 1]}–${WD[ds[ds.length - 1] - 1]}` : ds.map((x) => WD[x - 1]).join(", ");
  return `${days} · ${fmtMin(h.start)}–${fmtMin(h.end)}`;
}

function SidePanel({ feed, me, now, clock, hours, canEditHours, onOpen, onEditBusy, onHours }: {
  feed: CalendarFeed | null; me: string; now: Date; clock: Clock; hours: Hours; canEditHours: boolean;
  onOpen: (ev: Ev) => void; onEditBusy: (b: BusyOccurrence) => void; onHours: () => void;
}) {
  const { today } = clock;
  const next = (feed?.sessions ?? [])
    .filter((x) => isUpcoming(x, now) && activeInterviewerIds(x).includes(me))
    .sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, 3);
  const firstByBlock = new Map<string, BusyOccurrence>();
  for (const b of feed?.busy ?? []) {
    if (b.date < today) continue;
    const cur = firstByBlock.get(b.blockId);
    if (!cur || b.date < cur.date) firstByBlock.set(b.blockId, b);
  }
  const mine = [...firstByBlock.values()].sort((a, b) => a.date.localeCompare(b.date) || (a.fromMin ?? 0) - (b.fromMin ?? 0));
  return (
    <aside className="cl-side">
      <section className="cl-card">
        <header><b>Next interviews</b></header>
        {next.length ? next.map((x) => (
          <button type="button" key={x.id} className="cl-srow"
            onClick={() => onOpen({ kind: "iv", x, date: x.date, s: x.startMin, e: x.startMin + x.durationMin, organized: false, see: !x.limited, declined: false })}>
            <span className="sc-date is-up"><span>{dayShort(x.date)}</span><b>{dayNum(x.date)}</b></span>
            <span className="cl-lmain">
              <b>{fmtMin(x.startMin)} · {x.round ?? "Interview"}</b>
              <span className="shx-small">{!x.limited && x.candidateName ? x.candidateName + " · " : ""}{roomOf(x)}</span>
            </span>
          </button>
        )) : <span className="shx-small">No interviews scheduled for you.</span>}
      </section>
      <section className="cl-card">
        <header><b>My busy time</b><span className="shx-sp" /><span className="shx-small">{mine.length}</span></header>
        {mine.length ? mine.map((b) => (
          <button type="button" key={b.blockId} className="cl-srow" onClick={() => onEditBusy(b)}>
            <i className="cl-dot cl-dot--busy" style={{ marginTop: 5 }} />
            <span className="cl-lmain">
              <b>{b.note || "Busy"}</b>
              <span className="shx-small">{dayLong(b.date)} · {b.allDay ? "all day" : `${fmtMin(b.fromMin ?? 0)}–${fmtMin(b.toMin ?? DAY)}`}</span>
            </span>
            <Icon name="pencil" size={14} style={{ color: "var(--muted)" }} />
          </button>
        )) : <span className="shx-small">No busy time. Drag on the calendar to block hours you can’t interview.</span>}
        <span className="shx-small" style={{ marginTop: 4 }}><Icon name="lock" size={12} /> Others only see “Busy”. Notes are private to you.</span>
      </section>
      <section className="cl-card">
        <header>
          <b>Working hours</b><span className="shx-sp" />
          {canEditHours && <Button size="sm" variant="ghost" icon="pencil" onClick={onHours}>Edit</Button>}
        </header>
        <span style={{ fontSize: 13 }} className="sh-num">{hoursLabel(hours)}</span>
        <span className="shx-small">Company-wide. Booking outside these hours shows a warning but isn’t blocked.</span>
      </section>
    </aside>
  );
}

/** Busy-time details for blocks the viewer can't edit (others' or past). */
function BusyInfo({ ev, onClose }: { ev: Extract<Ev, { kind: "busy" }>; onClose: () => void }) {
  return (
    <Dialog title={evTitle(ev)} description={`${dayLong(ev.date)} · ${evTime(ev)}`} onClose={onClose}
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <span className="shx-small"><Icon name="lock" size={12} /> Others only see “Busy”. Notes are private to you.</span>
    </Dialog>
  );
}

/** Search-and-pick up to three colleagues to compare in Week view. */
function PeoplePicker({ me, picked, nameOf, onAdd, onRemove }: {
  me: string; picked: string[]; nameOf: (id: string) => string;
  onAdd: (p: PersonResult) => void; onRemove: (id: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const [focus, setFocus] = React.useState(false);
  const [res, setRes] = React.useState<{ q: string; items: PersonResult[]; error?: string } | null>(null);
  const term = q.trim();
  React.useEffect(() => {
    if (!term) return;
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      searchPeople(term, ac.signal).then(
        (items) => setRes({ q: term, items }),
        (e: unknown) => {
          if (ac.signal.aborted) return;
          setRes({ q: term, items: [], error: e instanceof Error ? e.message : "Could not search people." });
        },
      );
    }, 250);
    return () => { window.clearTimeout(t); ac.abort(); };
  }, [term]);
  const full = picked.length >= MAX_PEOPLE;
  const ready = res?.q === term;
  const list = ready
    ? res.items
      .filter((p) => p.id !== me && !picked.includes(p.id))
      .sort((a, b) => Number(b.sameChapter) - Number(a.sameChapter) || a.name.localeCompare(b.name))
      .slice(0, 8)
    : [];
  return (
    <div className="cl-people">
      {picked.map((id) => (
        <span key={id} className="cl-pchip" title={nameOf(id)}>
          <Icon name="user" size={13} style={{ color: "var(--muted)" }} />{nameOf(id)}
          <button type="button" aria-label={`Stop comparing ${nameOf(id)}`} onClick={() => onRemove(id)}><Icon name="x" size={12} /></button>
        </span>
      ))}
      <div className="cl-pick">
        <Input size="sm" icon="search" value={q} disabled={full} aria-label="Compare with people"
          placeholder={full ? `Up to ${MAX_PEOPLE} people` : "Compare with…"} style={{ width: 180 }}
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
                  <span className="shx-small">{p.email}{p.sameChapter ? " · your chapter" : ""}</span>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

type Load = { key: string; error?: string };

export type CalendarViewer = { userId: string; name: string; role: string; isHr: boolean; isAdmin: boolean };

export function CalendarApp({ embedded = false, viewer, initialPeople = [], initialWeek, initialSession }: {
  embedded?: boolean; viewer: CalendarViewer; initialPeople?: string[];
  /** Monday of the week to open on (a notification deep link). */
  initialWeek?: string;
  /** Session to open once the feed has loaded (a notification deep link). */
  initialSession?: string;
}) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const today = todayInTz(now);
  const clock: Clock = { today, nowMin: minuteOfDayInTz(now) };
  const base = weekStart(today);

  const [view, setView] = React.useState<"week" | "month" | "list">("week");
  // Past weeks stay reachable; forward stops at +4 weeks, deep links included.
  const minWk = -MAX_PAST_WEEKS;
  const maxWk = WEEKS - 1;
  const [wk, setWk] = React.useState(() =>
    initialWeek ? Math.max(minWk, Math.min(maxWk, Math.round(diffDays(base, initialWeek) / 7))) : 0);
  const pendingSession = React.useRef(initialSession ?? null);
  const [rev, setRev] = React.useState(0);
  const [feed, setFeed] = React.useState<CalendarFeed | null>(null);
  const [load, setLoad] = React.useState<Load | null>(null);
  const [open, setOpen] = React.useState<Ev | null>(null);
  const [toast, setToast] = React.useState<ToastMsg | null>(null);
  const [hoursOpen, setHoursOpen] = React.useState(false);
  const say = (text: string) => setToast({ title: text });
  const [busyMode, setBusyMode] = React.useState<BusyMode | null>(null);
  const busyDone: BusyDone = (msg, ask) => {
    setBusyMode(null);
    setRev((r) => r + 1);
    setToast({
      icon: "calendar-off",
      title: msg,
      action: ask
        ? {
          label: "Ask organizers",
          fn: () => {
            setToast(null);
            ask().then(
              () => { setRev((r) => r + 1); say("Organizers were asked to reschedule."); },
              (e: unknown) => say(e instanceof Error ? e.message : "Could not notify organizers."),
            );
          },
        }
        : undefined,
    });
  };
  const [people, setPeople] = React.useState<string[]>(() => initialPeople.slice(0, MAX_PEOPLE));
  const [names, setNames] = React.useState<Record<string, string>>({});
  const setCompared = (ids: string[]) => {
    setPeople(ids);
    const sp = new URLSearchParams(window.location.search);
    if (ids.length) sp.set("people", ids.join(","));
    else sp.delete("people");
    const qs = sp.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
  };

  const dropDeepLink = () => {
    const sp = new URLSearchParams(window.location.search);
    if (!sp.has("week") && !sp.has("session")) return;
    sp.delete("week");
    sp.delete("session");
    const qs = sp.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
  };

  const days = Array.from({ length: 7 }, (_, i) => addDays(base, wk * 7 + i));
  const from = view === "week" ? days[0] : base;
  const to = view === "week" ? days[6] : addDays(base, WEEKS * 7 - 1);
  const compared = view === "week" ? people : [];
  const peopleKey = compared.join(",");
  const key = `${from}|${to}|${peopleKey}|${rev}`;

  React.useEffect(() => {
    const ac = new AbortController();
    fetchCalendar({ from, to, people: peopleKey ? peopleKey.split(",") : undefined }, ac.signal).then(
      (f) => {
        setFeed(f);
        setLoad({ key });
        const sid = pendingSession.current;
        if (sid === null) return;
        pendingSession.current = null;
        const x = f.sessions.find((s) => s.id === sid);
        if (x) setOpen(ivEv(x, f.me));
        else setToast({ title: "That interview is no longer on your calendar." });
        dropDeepLink();
      },
      (e: unknown) => {
        if (ac.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
        setLoad({ key, error: e instanceof Error ? e.message : "Could not load the calendar." });
      },
    );
    return () => ac.abort();
  }, [from, to, peopleKey, key]);

  const loading = load?.key !== key;
  const error = load?.key === key ? load.error : undefined;
  const me = feed?.me ?? viewer.userId;
  // Only HR/Admin/Recruiter can organize interviews; everyone may compare busy lanes.
  const interviewerOnly = !(viewer.isAdmin || viewer.isHr || viewer.role === "recruiter");
  const hours = feed?.hours ?? FALLBACK_HOURS;
  const evs = React.useMemo(() => eventsByDate(feed), [feed]);
  const shown = view === "week" ? days : Array.from({ length: diffDays(from, to) + 1 }, (_, i) => addDays(from, i));
  const nameOf = (id: string) => names[id] ?? feed?.people.find((p) => p.id === id)?.name ?? "Loading…";
  const lanes: Lane[] = compared.map((id) => ({ id, name: nameOf(id), items: feed?.lanes[id] ?? [] }));
  const ivCount = shown.reduce((n, d) => n + (evs.get(d) ?? []).filter((e) => e.kind === "iv").length, 0);

  const goWeek = (n: number) => setWk(Math.max(minWk, Math.min(maxWk, n)));
  const range = (date: string, s: number, e: number) =>
    date < today ? say("Busy time can’t start in the past.") : setBusyMode({ kind: "new", date, from: s, to: e });
  const markBusy = () => setBusyMode({ kind: "new", date: view === "week" && days[0] > today ? days[0] : today });
  const editBusy = (b: BusyOccurrence) => { setOpen(null); setBusyMode({ kind: "edit", occ: b }); };
  const openEv = (ev: Ev | null) => (ev?.kind === "busy" && ev.own && !isPast(ev, clock) ? editBusy(ev.b) : setOpen(ev));

  return (
    <Shell
      embedded={embedded}
      active="cal"
      user={{ key: viewer.isHr ? "hr" : "rc", name: viewer.name, role: viewer.role, salary: false, allJobs: viewer.isHr, canCreate: false, canDecide: false } satisfies Role}
      crumbs={["Calendar"]}
      title="Calendar"
      trail={[{ label: "Calendar" }]}
      subtitle="Interviews you attend or organize, and the time you’re busy."
      onHome={() => {}}
      meta={feed && (
        <span className="shx-small" aria-live="polite">
          {feed.upcomingCount === 0
            ? "No interviews in the next 90 days"
            : `${feed.upcomingCount} upcoming interview${feed.upcomingCount === 1 ? "" : "s"} in the next 90 days`}
        </span>
      )}
      actions={<Button variant="secondary" icon="calendar-off" onClick={markBusy}>Mark as busy</Button>}
    >
      <div className="cl-wrap">
        <div className="cl-main">
          <div className="cl-bar">
            <div className="cl-seg" role="group" aria-label="View">
              {(["week", "month", "list"] as const).map((v) => (
                <button type="button" key={v} aria-pressed={view === v} className={view === v ? "is-on" : ""} onClick={() => setView(v)}>
                  {v === "week" ? "Week" : v === "month" ? "Month" : "List"}
                </button>
              ))}
            </div>
            {view === "week" && (
              <div className="cl-range">
                <Button size="sm" variant="ghost" icon="chevron-left" aria-label="Previous week" disabled={wk <= minWk} onClick={() => goWeek(wk - 1)} />
                <b>{rangeLabel(days[0], days[6])}</b>
                <Button size="sm" variant="ghost" icon="chevron-right" aria-label="Next week" disabled={wk >= maxWk} onClick={() => goWeek(wk + 1)} />
                <Button size="sm" variant="secondary" disabled={wk === 0} onClick={() => goWeek(0)}>Today</Button>
              </div>
            )}
            {view !== "week" && <b>{rangeLabel(view === "list" ? today : from, to)}</b>}
            {view === "week" && (
              <PeoplePicker me={me} picked={people} nameOf={nameOf}
                onAdd={(p) => { setNames((n) => ({ ...n, [p.id]: p.name })); setCompared([...people, p.id].slice(0, MAX_PEOPLE)); }}
                onRemove={(id) => setCompared(people.filter((x) => x !== id))} />
            )}
            <span className="shx-small" aria-live="polite">
              {loading ? "Loading…" : `${ivCount} ${ivCount === 1 ? "interview" : "interviews"}`}
            </span>
          </div>
          {error && (
            <Banner tone="danger" title="Couldn’t load the calendar" action={<Button size="sm" variant="secondary" onClick={() => setRev((r) => r + 1)}>Retry</Button>}>
              {error}
            </Banner>
          )}
          {view === "week" && (
            <>
              <CalGrid days={days} evs={evs} hours={hours} clock={clock} dim={loading} lanes={lanes} onRange={range} onOpen={openEv} />
              <div className="cl-legend">
                <span><i className="cl-dot cl-dot--iv" /> Interview you attend</span>
                {!interviewerOnly && <span><i className="cl-dot cl-dot--org" /> You organized</span>}
                <span><i className="cl-dot cl-dot--busy" /> Busy</span>
                <span className="shx-small">
                  {lanes.length ? "Compared people show only “Busy” or “Interview”. " : ""}Drag on the grid to mark time as busy.
                </span>
              </div>
            </>
          )}
          {view === "month" && (
            <MonthView base={base} evs={evs} hours={hours} clock={clock} dim={loading} onOpen={openEv}
              onDay={(d) => { goWeek(Math.floor(diffDays(base, d) / 7)); setView("week"); }} />
          )}
          {view === "list" && <ListView to={to} evs={evs} clock={clock} dim={loading} onOpen={openEv} />}
        </div>
        <SidePanel feed={feed} me={me} now={now} clock={clock} hours={hours} canEditHours={(viewer.isAdmin || viewer.isHr)}
          onOpen={openEv} onEditBusy={editBusy} onHours={() => setHoursOpen(true)} />
      </div>

      {hoursOpen && (viewer.isAdmin || viewer.isHr) && (
        <HoursDialog hours={hours} onClose={() => setHoursOpen(false)}
          onDone={(msg) => { setHoursOpen(false); setRev((r) => r + 1); say(msg); }} />
      )}
      {open?.kind === "busy" && <BusyInfo ev={open} onClose={() => setOpen(null)} />}
      {open?.kind === "iv" && feed && (
        <EventDialog key={open.x.id} x={open.x} title={evTitle(open)} organized={open.organized} see={open.see}
          feed={feed} me={me} now={now} onClose={() => setOpen(null)}
          onDone={(msg) => { setOpen(null); setRev((r) => r + 1); say(msg); }} />
      )}
      {busyMode && (
        <BusyDialog mode={busyMode} feed={feed} today={today} onClose={() => setBusyMode(null)} onDone={busyDone} />
      )}
      {toast && <Toast t={toast} onClose={() => setToast(null)} />}
    </Shell>
  );
}
