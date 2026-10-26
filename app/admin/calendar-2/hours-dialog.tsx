"use client";

import React from "react";
import { Banner, Button, Dialog, Select } from "../position-management-2/ext";
import { saveHours } from "./api";
import { fmtMin, type Hours } from "./data";

const COL: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12 };
/** Matches the hours route: 06:00–21:00 in 30-minute steps. */
const MIN = 360;
const MAX = 1260;
const STEP = 30;
/** Older settings may sit off the grid; snap them so the selects show a value. */
const snap = (m: number) => Math.max(MIN, Math.min(MAX, Math.round(m / STEP) * STEP));
/** ISO weekday numbers: 1 = Monday … 7 = Sunday. */
const DAYS = [
  { n: 1, label: "Mon" }, { n: 2, label: "Tue" }, { n: 3, label: "Wed" }, { n: 4, label: "Thu" },
  { n: 5, label: "Fri" }, { n: 6, label: "Sat" }, { n: 7, label: "Sun" },
];

const timeOpts = (from: number, to: number) => {
  const out: { value: string; label: string }[] = [];
  for (let m = from; m <= to; m += STEP) out.push({ value: String(m), label: fmtMin(m) });
  return out;
};

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** HR only: edit company-wide working hours. */
export function HoursDialog({ hours, onClose, onDone }: {
  hours: Hours;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [start, setStart] = React.useState(() => snap(hours.start));
  const [end, setEnd] = React.useState(() => snap(hours.end));
  const [days, setDays] = React.useState<number[]>(() => [...hours.days].sort((a, b) => a - b));
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const badRange = end <= start;
  const noDays = days.length === 0;
  const unchanged = start === hours.start && end === hours.end
    && days.join() === [...hours.days].sort((a, b) => a - b).join();

  const toggle = (n: number) =>
    setDays((ds) => (ds.includes(n) ? ds.filter((x) => x !== n) : [...ds, n].sort((a, b) => a - b)));

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await saveHours({ start, end, days });
      onDone("Working hours updated for the company.");
    } catch (e) {
      setErr(errText(e, "Could not save working hours."));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Company working hours"
      description="Interviews outside these hours show a warning. Applies to everyone."
      width={440}
      onClose={onClose}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={save} disabled={busy || badRange || noDays || unchanged}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </>}
    >
      <div style={COL}>
        {err && <Banner tone="danger" title={err} />}
        <div className="sc-2">
          <Select label="Start" value={String(start)} onChange={(e) => setStart(Number(e.target.value))}
            options={timeOpts(MIN, MAX - STEP)} />
          <Select label="End" value={String(end)} onChange={(e) => setEnd(Number(e.target.value))}
            options={timeOpts(MIN + STEP, MAX)} hint={badRange ? "End must be after start." : undefined} />
        </div>
        <div className="sc-field">
          <span className="sc-label">Working days</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {DAYS.map((d) => (
              <label key={d.n} className="cd-opt" style={{ padding: "6px 10px", alignItems: "center" }}>
                <input type="checkbox" checked={days.includes(d.n)} onChange={() => toggle(d.n)} style={{ marginTop: 0 }} />
                <span>{d.label}</span>
              </label>
            ))}
          </div>
          {noDays && <span className="shx-small" style={{ color: "var(--danger, #b42318)" }}>Pick at least one working day.</span>}
        </div>
      </div>
    </Dialog>
  );
}
