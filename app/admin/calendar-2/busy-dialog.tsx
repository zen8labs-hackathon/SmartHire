"use client";

import React from "react";
import { Banner, Button, Checkbox, Dialog, Input, Select } from "../position-management-2/ext";
import { createBusy, deleteBusy, fetchBusy, previewBusyOverlaps, updateBusy } from "./api";
import {
  addDays, dayLong, fmtMin, isoDateInTz, isoWeekday,
  type BusyBlock, type BusyBlockRepeat, type BusyOccurrence, type BusyOverlap, type BusyScope, type CalendarFeed,
  minuteOfDayInTz, type OnOverlap, type Session,
} from "./data";

/** Mirrors `lib/calendar/validation.ts`. */
const FIRST = 480;
const LAST = 1140;
const MAX_REPEAT_DAYS = 92;
const NOTE_MAX = 200;
const DEFAULT_REPEAT_DAYS = 27;
const COL: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12 };

export type BusyMode =
  | { kind: "new"; date: string; from?: number; to?: number }
  | { kind: "edit"; occ: BusyOccurrence };

/** Called after a successful save or delete; `ask` re-sends the change asking organizers to move overlaps. */
export type BusyDone = (msg: string, ask?: () => Promise<void>) => void;

type Props = { mode: BusyMode; feed: CalendarFeed | null; today: string; onClose: () => void; onDone: BusyDone };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const REPEAT_LABEL: Record<BusyBlockRepeat, string> = { none: "Doesn’t repeat", weekdays: "Every weekday", weekly: "Weekly" };

const timeOpts = (a: number, b: number) => {
  const out = [];
  for (let m = a; m <= b; m += 30) out.push({ value: String(m), label: fmtMin(m) });
  return out;
};
const snap = (m: number) => Math.round(m / 30) * 30;
const clamp = (m: number, a: number, b: number) => Math.max(a, Math.min(b, m));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** Occurrence dates of a shape between `from` and `to` (inclusive), ignoring removals. */
function occurrences(start: string, repeat: BusyBlockRepeat, until: string | null, from: string, to: string, days: number[] = []): string[] {
  if (repeat === "none" || !until) return start >= from && start <= to ? [start] : [];
  const out: string[] = [];
  const picked = days.length ? days : [isoWeekday(start)];
  const last = until < to ? until : to;
  for (let d = start < from ? from : start; d <= last; d = addDays(d, 1)) {
    const w = isoWeekday(d);
    if (repeat === "weekdays" ? w <= 5 : picked.includes(w)) out.push(d);
  }
  return out;
}

function Opt({ name, checked, onChange, title, sub }: { name: string; checked: boolean; onChange: () => void; title: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <label className="cd-opt">
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      <span><b>{title}</b>{sub && <span className="shx-small">{sub}</span>}</span>
    </label>
  );
}

function ScopePicker({ name, label, value, onChange, date, block }: {
  name: string; label: string; value: BusyScope; onChange: (s: BusyScope) => void; date: string; block: BusyBlock;
}) {
  return (
    <div className="sc-field">
      <span className="sc-label">{label}</span>
      <Opt name={name} checked={value === "day"} onChange={() => onChange("day")} title={`Only ${dayLong(date)}`} />
      {date !== block.startDate && (
        <Opt name={name} checked={value === "following"} onChange={() => onChange("following")} title="This and following days" />
      )}
      <Opt name={name} checked={value === "series"} onChange={() => onChange("series")} title="All days in the series" />
    </div>
  );
}

const overlapLine = (o: BusyOverlap) =>
  `${dayLong(isoDateInTz(o.start))} ${fmtMin(minuteOfDayInTz(o.start))} · ${o.round ?? "Interview"}${o.candidateName ? ` · ${o.candidateName}` : ""}`;

/** Create or edit the viewer's busy time. Loads the block first when editing. */
export function BusyDialog(props: Props) {
  const { mode, onClose } = props;
  const id = mode.kind === "edit" ? mode.occ.blockId : null;
  const [loaded, setLoaded] = React.useState<{ id: string; block?: BusyBlock; error?: string } | null>(null);

  React.useEffect(() => {
    if (!id) return;
    let live = true;
    fetchBusy(id).then(
      (block) => live && setLoaded({ id, block }),
      (e: unknown) => live && setLoaded({ id, error: errText(e, "Could not load busy time.") }),
    );
    return () => { live = false; };
  }, [id]);

  if (!id) return <BusyForm {...props} block={null} />;
  if (loaded?.id === id && loaded.block) return <BusyForm {...props} block={loaded.block} />;
  return (
    <Dialog title="Edit busy time" width={520} onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {loaded?.id === id && loaded.error
        ? <Banner tone="danger" title="Couldn’t load this busy time">{loaded.error}</Banner>
        : <span className="shx-small">Loading…</span>}
    </Dialog>
  );
}

function BusyForm({ mode, feed, today, onClose, onDone, block }: Props & { block: BusyBlock | null }) {
  const occ = mode.kind === "edit" ? mode.occ : null;
  const repeating = !!block && block.repeat !== "none";

  const init = (() => {
    if (block) {
      return {
        date: occ!.date, all: block.allDay, from: block.fromMin ?? 540, to: block.toMin ?? 600,
        note: block.note ?? "", repeat: block.repeat, until: block.untilDate, days: block.days,
      };
    }
    const m = mode as Extract<BusyMode, { kind: "new" }>;
    const from = clamp(snap(m.from ?? 540), FIRST, LAST - 30);
    const to = clamp(snap(m.to ?? from + 60), from + 30, LAST);
    return { date: m.date < today ? today : m.date, all: false, from, to, note: "", repeat: "none" as BusyBlockRepeat, until: null, days: [] as number[] };
  })();

  const [scope, setScope] = React.useState<BusyScope>(repeating ? "day" : "series");
  const [date, setDate] = React.useState(init.date);
  const [all, setAll] = React.useState(init.all);
  const [from, setFrom] = React.useState(init.from);
  const [to, setTo] = React.useState(init.to);
  const [note, setNote] = React.useState(init.note);
  const [repeat, setRepeat] = React.useState<BusyBlockRepeat>(init.repeat);
  const [pickedDays, setPickedDays] = React.useState<number[]>(init.days);
  const [until, setUntil] = React.useState<string | null>(init.until);
  const [choice, setChoice] = React.useState<OnOverlap>("keep");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [delScope, setDelScope] = React.useState<BusyScope>(repeating ? "day" : "series");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // A single-day edit of a series detaches that day; it cannot repeat on its own.
  const single = repeating && scope === "day";
  const dateEditable = !block || !repeating || single;
  const start = !block ? date : !repeating || single ? date : scope === "following" ? occ!.date : block.startDate;
  const effRepeat: BusyBlockRepeat = single ? "none" : repeat;
  const maxUntil = addDays(start, MAX_REPEAT_DAYS);
  const effUntil = effRepeat === "none" ? null : (until && until >= start ? until : addDays(start, DEFAULT_REPEAT_DAYS));

  const removed = new Set(block && scope === "series" ? block.removedDates : []);
  const days = effRepeat === "weekly" ? (pickedDays.length ? pickedDays : [isoWeekday(start)]) : [];
  const count = effRepeat === "none" ? 1 : occurrences(start, effRepeat, effUntil, start, effUntil!, days).filter((d) => !removed.has(d)).length;

  const problem =
    !date || (dateEditable && (date < today || (date === today && !all && from < minuteOfDayInTz(new Date())))) ? "Choose a future time."
      : !all && to <= from ? "End must be after start."
        : effUntil && effUntil > maxUntil ? "A repeating block can run at most 3 months."
          : effRepeat !== "none" && count === 0 ? "This repeat has no days before the end date."
            : null;

  // BR-03-09: ask the server, so the whole repeat range is checked, not only the loaded weeks.
  const [hits, setHits] = React.useState<BusyOverlap[]>([]);
  const previewKey = problem ? null : JSON.stringify([start, all, all ? null : from, all ? null : to, effRepeat, effUntil, days]);
  React.useEffect(() => {
    if (!previewKey) { setHits([]); return; }
    let live = true;
    const t = setTimeout(() => {
      const [startDate, allDay, fromMin, toMin, repeat, untilDate, d] = JSON.parse(previewKey);
      previewBusyOverlaps({ startDate, allDay, fromMin, toMin, repeat, untilDate, days: d, note: null }).then(
        (r) => { if (live) setHits(r); },
        () => { if (live) setHits([]); },
      );
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [previewKey]);

  const finish = (verb: string, overlaps: BusyOverlap[], askId: string | null) => {
    if (!overlaps.length || choice === "ask") {
      const asked = overlaps.length ? ` Organizers of ${plural(overlaps.length, "interview")} were asked to reschedule.` : "";
      onDone(`Busy time ${verb}.${asked}`);
      return;
    }
    const ask = askId
      ? async () => { await updateBusy(askId, { scope: "series", onOverlap: "ask" }); }
      : undefined;
    onDone(`Busy time ${verb}. It overlaps ${plural(overlaps.length, "interview")} you’re on.`, ask);
  };

  const save = async () => {
    if (problem || busy) return;
    setBusy(true);
    setError(null);
    const shape = {
      allDay: all,
      fromMin: all ? null : from,
      toMin: all ? null : to,
      note: note.trim() || null,
      repeat: effRepeat,
      untilDate: effUntil,
      days,
    };
    try {
      if (!block) {
        const r = await createBusy({ ...shape, startDate: date, onOverlap: choice });
        finish("saved", r.overlaps, r.block.id);
      } else {
        const r = await updateBusy(block.id, {
          ...shape,
          ...(dateEditable ? { startDate: date } : {}),
          scope: repeating ? scope : "series",
          ...(repeating && scope !== "series" ? { date: occ!.date } : {}),
          onOverlap: choice,
        });
        const edited = r.blocks[r.blocks.length - 1];
        finish("updated", r.overlaps, edited?.id ?? null);
      }
    } catch (e) {
      setError(errText(e, "Could not save busy time."));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!block || busy) return;
    setBusy(true);
    setError(null);
    try {
      const s = repeating ? delScope : "series";
      await deleteBusy(block.id, { scope: s, ...(s !== "series" ? { date: occ!.date } : {}) });
      onDone(s === "day" ? `Busy time removed on ${dayLong(occ!.date)}.` : "Busy time removed.");
    } catch (e) {
      setError(errText(e, "Could not remove busy time."));
      setBusy(false);
    }
  };

  if (confirmDelete && block) {
    return (
      <Dialog title="Remove busy time?" width={480} onClose={onClose}
        description={`${dayLong(occ!.date)} · ${block.allDay ? "All day" : `${fmtMin(block.fromMin ?? 0)}–${fmtMin(block.toMin ?? 0)}`}`}
        footer={<>
          <Button variant="secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Back</Button>
          <Button variant="danger" icon="trash-2" disabled={busy} onClick={remove}>{busy ? "Removing…" : "Remove"}</Button>
        </>}>
        <div style={COL}>
          {repeating
            ? <ScopePicker name="bd-del" label="Remove" value={delScope} onChange={setDelScope} date={occ!.date} block={block} />
            : null}
          <span className="shx-small">This can’t be undone.</span>
          {error && <Banner tone="danger" title="Couldn’t remove busy time">{error}</Banner>}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={block ? "Edit busy time" : "Mark as busy"} width={520} onClose={onClose}
      description="Others see this only as “Busy”. Interviews won’t be scheduled over it."
      footer={<>
        {block && (
          <Button variant="danger-ghost" icon="trash-2" disabled={busy} onClick={() => { setError(null); setConfirmDelete(true); }}
            style={{ marginRight: "auto" }}>{repeating ? "Delete all" : "Delete"}</Button>
        )}
        <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button disabled={!!problem || busy} onClick={save}>{busy ? "Saving…" : "Save"}</Button>
      </>}>
      <div style={COL}>
        {repeating && block && <ScopePicker name="bd-scope" label="Change" value={scope} onChange={setScope} date={occ!.date} block={block} />}
        {dateEditable ? (
          <Input label="Date" type="date" min={today} value={date}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDate(e.target.value)} />
        ) : (
          <div className="sc-field">
            <span className="sc-label">Starts</span>
            <span>{dayLong(start)}</span>
          </div>
        )}
        <Checkbox checked={all} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAll(e.target.checked)} label="All day" />
        {!all && (
          <div className="sc-2">
            <Select label="From" value={String(from)} options={timeOpts(FIRST, LAST - 30)}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                const v = +e.target.value;
                setFrom(v);
                if (to <= v) setTo(Math.min(v + 60, LAST));
              }} />
            <Select label="To" value={String(to)} options={timeOpts(FIRST + 30, LAST)}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTo(+e.target.value)} />
          </div>
        )}
        <Input label="Note (only you see this)" placeholder="e.g. Client meeting" maxLength={NOTE_MAX} value={note}
          hint={`${note.length}/${NOTE_MAX}`}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNote(e.target.value)} />
        {!single && (
          <div className="sc-field">
            <span className="sc-label">Repeat</span>
            <div className="sc-seg" role="group" aria-label="Repeat">
              {(["none", "weekdays", "weekly"] as const).map((r) => (
                <button type="button" key={r} aria-pressed={repeat === r} onClick={() => setRepeat(r)}>
                  {REPEAT_LABEL[r]}
                </button>
              ))}
            </div>
          </div>
        )}
        {effRepeat === "weekly" && (
          <div className="sc-field">
            <span className="sc-label">On</span>
            <div className="sc-seg" role="group" aria-label="Repeat on weekdays">
              {WEEKDAYS.map((label, i) => {
                const n = i + 1;
                const on = days.includes(n);
                return (
                  <button type="button" key={n} aria-pressed={on}
                    onClick={() => on && days.length === 1 ? undefined : setPickedDays(on ? days.filter((d) => d !== n) : [...days, n].sort((a, b) => a - b))}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {effRepeat !== "none" && (
          <Input label="Until" type="date" min={start} max={maxUntil} value={effUntil ?? ""}
            hint={`${plural(count, "day")} · at most 3 months (${dayLong(maxUntil)})`}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUntil(e.target.value || null)} />
        )}
        {hits.length > 0 && (
          <>
            <Banner tone="warning" title={`This overlaps ${plural(hits.length, "interview")} you’re on`}>
              {hits.map(overlapLine).join("; ")}
            </Banner>
            <Opt name="bd-ov" checked={choice === "ask"} onChange={() => setChoice("ask")}
              title="Ask organizers to reschedule" sub="They get a notification; the interview stays until they move it." />
            <Opt name="bd-ov" checked={choice === "keep"} onChange={() => setChoice("keep")}
              title="Keep the interviews" sub="I’ll still attend; only block other time." />
          </>
        )}
        {problem && <span className="shx-small" role="alert" style={{ color: "var(--danger)" }}>{problem}</span>}
        {error && <Banner tone="danger" title="Couldn’t save busy time">{error}</Banner>}
      </div>
    </Dialog>
  );
}
