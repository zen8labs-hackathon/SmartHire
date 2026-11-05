 
"use client";

import * as React from "react";
import { Badge, Banner, Button, Card, Dialog, Icon, Input, Select } from "../position-management-2/ext";
import {
  COOLDOWN, ORDER, REASONS, REHIRE, RETAIN, RL, TODAY, addM, ago, canSeeApp, cooldown, pd, remindDue, retainDays, retainEnd,
  type CandApp, type Persona, type Person,
} from "./data";

void COOLDOWN;

export type Act = (k: string, x?: any) => void;

export const logE = (user: Persona, icon: string, title: string, sub?: string) => (x: Person) =>
  [{ d: TODAY, type: "record", icon, title, sub: user.name + (sub ? " · " + sub : "") }, ...(x.log || [])];

function Opt({ on, onClick, name, children }: { on?: boolean; onClick: () => void; name: string; children: React.ReactNode }) {
  return (
    <label className={"cd-opt" + (on ? " is-on" : "")}>
      <input type="radio" name={name} checked={!!on} onChange={onClick} />
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>{children}</span>
    </label>
  );
}

function Area(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="jb-textarea" style={{ width: "100%", boxSizing: "border-box" }} {...props} />;
}

export function HistoryStrip({ p, user }: { p: Person; user: Persona }) {
  const vis = p.apps.filter((a) => canSeeApp(user, a));
  const first = p.apps.map((a) => a.date).sort((a, b) => +pd(a) - +pd(b))[0] || p.created;
  const far = vis.reduce<{ i: number; a?: CandApp }>((m, a) => {
    const i = ORDER.indexOf(a.result === "official" ? "Official" : a.stage);
    return i > m.i ? { i, a } : m;
  }, { i: -1 });
  const ended = vis.filter((a) => a.result === "ended").sort((a, b) => +pd(b.end || b.date) - +pd(a.end || a.date))[0];
  const cd = cooldown(p);
  const rh = p.rehire.v ? REHIRE[p.rehire.v] : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="mv-strip">
        <div><span className="jb-overline">Applications</span><b className="sh-num">{p.apps.length}{p.apps.length > 1 ? " times" : " time"}</b><small>since {first.slice(3)}</small></div>
        <div>
          <span className="jb-overline">Furthest stage</span>
          <b>{far.a ? (far.a.result === "official" ? "Official" : far.a.round || far.a.stage) : "—"}</b>
          <small>{far.a ? far.a.title + (far.a.job ? " #" + far.a.job : "") : "Not in a position yet"}</small>
        </div>
        <div>
          <span className="jb-overline">Last ended</span>
          {ended
            ? <><b>{ended.rk ? RL[ended.rk] : "Reason not recorded"}</b><small>{(ended.round || ended.stage) + " · " + (ended.end || ended.date).slice(-7)}</small></>
            : <><b>—</b><small>No ended applications</small></>}
        </div>
        <div>
          <span className="jb-overline">Rehire</span>
          {rh
            ? <><span><Badge tone={rh.tone} icon={rh.icon}>{rh.label}</Badge></span><small>Set by {(p.rehire.by || "").split(" ").pop()} · {p.rehire.at}</small></>
            : <><b style={{ color: "var(--muted)", fontWeight: 500 }}>Not set</b><small>HR sets this when an application ends</small></>}
        </div>
      </div>
      {cd && canSeeApp(user, cd) && (
        <Banner tone="warning" icon="history" title={"Re-applied " + ago(cd.end!).replace(" ago", "") + " after ending at " + (cd.round || cd.stage)}>
          {cd.title} #{cd.job} ended on {cd.end}{cd.rk ? " — " + RL[cd.rk] + (cd.reason ? ": " + cd.reason : "") : ""}. {rh ? "Rehire: " + rh.label + ". " : ""}This is a reminder only; the new application continues normally.
        </Banner>
      )}
    </div>
  );
}

function RehireDialog({ p, onClose, onOk }: { p: Person; onClose: () => void; onOk: (v: "eligible" | "ask" | "no", r: string) => void }) {
  const [v, setV] = React.useState<"eligible" | "ask" | "no">(p.rehire.v || "eligible");
  const [r, setR] = React.useState(p.rehire.reason || "");
  const need = v !== "eligible" && !r.trim();
  return (
    <Dialog
      title="Rehire eligibility" description={"Shown to recruiters when " + p.name + " applies again. It never blocks an application."} onClose={onClose} width={520}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={need} onClick={() => onOk(v, r.trim())}>Save</Button></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Opt name="rh" on={v === "eligible"} onClick={() => setV("eligible")}><b style={{ fontWeight: 500 }}>Eligible</b><span className="shx-small">Recruiters can move forward as usual.</span></Opt>
        <Opt name="rh" on={v === "ask"} onClick={() => setV("ask")}><b style={{ fontWeight: 500 }}>Ask HR first</b><span className="shx-small">Recruiters see a prompt to check with HR before an interview.</span></Opt>
        <Opt name="rh" on={v === "no"} onClick={() => setV("no")}><b style={{ fontWeight: 500 }}>Not eligible</b><span className="shx-small">Recruiters see a warning. They can still continue after reading the reason.</span></Opt>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, fontSize: 13 }}>
          <span>Reason{v !== "eligible" ? " (required)" : " (optional)"}</span>
          <Area value={r} onChange={(e) => setR(e.target.value)} placeholder="Facts only. Visible to HR, recruiters and Chapter Heads." />
        </label>
      </div>
    </Dialog>
  );
}

const isoOf = (s: string) => {
  const x = pd(s);
  return x ? x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0") : "";
};

export function ReminderDialog({ p, onClose, onOk }: { p: { name: string; remind?: Person["remind"] }; onClose: () => void; onOk: (d: string, n: string) => void }) {
  const [d, setD] = React.useState(p.remind ? p.remind.date : addM(TODAY, 3));
  const [n, setN] = React.useState(p.remind ? p.remind.note : "");
  return (
    <Dialog
      title={"Re-contact " + p.name} description="You’ll get a notification on this date. The candidate is not contacted automatically." onClose={onClose} width={480}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon="bell" disabled={!d} onClick={() => onOk(d, n.trim())}>Set reminder</Button></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
        <div className="shx-row" style={{ gap: 6 }}>
          {[1, 3, 6].map((m) => <button key={m} className={"jb-fchip" + (d === addM(TODAY, m) ? " is-on" : "")} onClick={() => setD(addM(TODAY, m))}>In {m} {m === 1 ? "month" : "months"}</button>)}
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>Date</span>
          <Input type="date" value={isoOf(d)} onChange={(e) => { const [y, m, dd] = e.target.value.split("-"); setD(dd ? dd + "/" + m + "/" + y : ""); }} style={{ width: 200 }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>What to follow up on</span>
          <Area value={n} onChange={(e) => setN(e.target.value)} placeholder="Ask about the Java Lead opening in Q1" />
        </label>
      </div>
    </Dialog>
  );
}

function ReasonDialog({ a, onClose, onOk }: { a: CandApp; onClose: () => void; onOk: (k: string, n: string) => void }) {
  const [k, setK] = React.useState<string | null>(a.rk || null);
  const [n, setN] = React.useState(a.reason || "");
  const ok = !!k && (k !== "other" || !!n.trim());
  return (
    <Dialog
      title="Record why this application ended" description={a.title + " #" + a.job + " · ended at " + (a.round || a.stage) + (a.end ? " on " + a.end : "")} onClose={onClose} width={540}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!ok} onClick={() => onOk(k!, n.trim())}>Save reason</Button></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, overflowX: "hidden" }}>
        {REASONS.map(([id, l, d]) => <Opt key={id} name="rs" on={k === id} onClick={() => setK(id)}><b style={{ fontWeight: 500 }}>{l}</b><span className="shx-small">{d}</span></Opt>)}
        <label style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, fontSize: 13 }}>
          <span>Note{k === "other" ? " (required)" : " (optional)"}</span>
          <Area value={n} onChange={(e) => setN(e.target.value)} placeholder="What should a recruiter know if this person applies again?" />
        </label>
        <span className="shx-small">Reasons are reported by category. Notes are visible to HR and the position’s Chapter Head.</span>
      </div>
    </Dialog>
  );
}

export function BulkTagDialog({ n, tags, onClose, onOk }: { n: number; tags: string[]; onClose: () => void; onOk: (t: string) => void }) {
  const [t, setT] = React.useState("");
  return (
    <Dialog
      title={"Add a tag to " + n + " candidates"} description="Candidates who already have the tag are skipped." onClose={onClose} width={460}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon="tag" disabled={!t.trim()} onClick={() => onOk(t.trim())}>Add tag</Button></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Input icon="tag" placeholder="e.g. Japanese N2+" value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === "Enter" && t.trim() && onOk(t.trim())} />
        {tags.length > 0 && (
          <>
            <span className="jb-overline">Existing tags</span>
            <div className="jb-chips" style={{ gap: 6 }}>{tags.map((g) => <button key={g} className={"jb-fchip" + (t === g ? " is-on" : "")} onClick={() => setT(g)}>{g}</button>)}</div>
          </>
        )}
      </div>
    </Dialog>
  );
}

export function RehireCard({ p, user, act }: { p: Person; user: Persona; act: Act }) {
  const [dlg, setDlg] = React.useState(false);
  const rh = p.rehire.v ? REHIRE[p.rehire.v] : null;
  return (
    <Card title="Rehire eligibility" right={user.allJobs && !user.admin && <Button size="sm" variant="ghost" icon="pencil" onClick={() => setDlg(true)}>{rh ? "Change" : "Set"}</Button>}>
      {rh
        ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span><Badge tone={rh.tone} icon={rh.icon}>{rh.label}</Badge></span>
            {p.rehire.reason && <span style={{ fontSize: 13, color: "var(--fg-2)" }}>{p.rehire.reason}</span>}
            <span className="shx-small">Set by {p.rehire.by} · {p.rehire.at}</span>
          </div>
        )
        : <span className="shx-small">Not set. Set it when an application ends or someone leaves, so recruiters have context if they apply again.</span>}
      {dlg && (
        <RehireDialog
          p={p} onClose={() => setDlg(false)}
          onOk={(v, r) => {
            setDlg(false);
            if (p.uuid) { act("rehire", { v, r }); return; }
            act("patch", {
              f: (x: Person) => ({ rehire: { v, reason: r, by: user.name, at: TODAY }, log: logE(user, "user-check", "Rehire set to: " + REHIRE[v].label, r)(x) }),
              title: "Rehire eligibility saved", body: REHIRE[v].label + ". Recruiters see this when " + p.name + " applies again.", icon: "user-check",
            });
          }}
        />
      )}
    </Card>
  );
}

export function TalentCard({ p, user, act }: { p: Person; user: Persona; act: Act }) {
  const [t, setT] = React.useState("");
  const [dlg, setDlg] = React.useState(false);
  const can = user.key !== "iv";
  const add = () => {
    const v = t.trim();
    setT("");
    if (!v || p.tags.includes(v)) return;
    act("patch", { f: (x: Person) => ({ tags: [...x.tags, v] }), title: "Tag added", body: "“" + v + "” · filter by it on the Candidates list.", icon: "tag" });
  };
  const due = remindDue(p);
  return (
    <Card title="Talent pool">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="jb-overline">Tags</span>
          <div className="jb-chips" style={{ gap: 6 }}>
            {p.tags.map((g) => (
              <span key={g} className="jb-achip">
                {g}
                {can && <button aria-label={"Remove " + g} onClick={() => act("patch", { f: (x: Person) => ({ tags: x.tags.filter((y) => y !== g) }), title: "Tag removed", body: "“" + g + "”", icon: "tag" })}><Icon name="x" size={12} /></button>}
              </span>
            ))}
            {!p.tags.length && <span className="shx-small">No tags yet</span>}
          </div>
          {can && <Input size="sm" icon="tag" placeholder="Add a tag and press Enter" value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="jb-overline">Re-contact reminder</span>
          {p.remind
            ? (
              <div className="mv-remind" data-due={due}>
                <Icon name={due ? "bell-ring" : "bell"} size={16} style={{ color: due ? "var(--warning)" : "var(--accent)", marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="shx-row" style={{ gap: 6 }}><b className="sh-num" style={{ fontWeight: 600 }}>{p.remind.date}</b>{due && <Badge tone="warning" icon="clock">Due</Badge>}</span>
                  {p.remind.note && <span style={{ fontSize: 13 }}>{p.remind.note}</span>}
                  <span className="shx-small">Notifies {p.remind.owner}</span>
                  {can && (
                    <div className="shx-row" style={{ gap: 6, marginTop: 4 }}>
                      <Button size="sm" variant="secondary" icon="check" onClick={() => act("patch", { f: (x: Person) => ({ remind: null, log: logE(user, "phone", "Re-contacted", x.remind?.note)(x) }), title: "Marked as contacted", body: "Logged in History. Set a new reminder if you need another follow-up.", icon: "check" })}>Mark contacted</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDlg(true)}>Change</Button>
                    </div>
                  )}
                </div>
              </div>
            )
            : can
              ? <span><Button size="sm" variant="secondary" icon="bell-plus" onClick={() => setDlg(true)}>Set reminder</Button></span>
              : <span className="shx-small">No reminder</span>}
        </div>
      </div>
      {dlg && (
        <ReminderDialog
          p={p} onClose={() => setDlg(false)}
          onOk={(d, n) => { setDlg(false); act("patch", { f: () => ({ remind: { date: d, note: n, owner: user.name } }), title: "Reminder set for " + d, body: "You’ll get a notification that day.", icon: "bell" }); }}
        />
      )}
    </Card>
  );
}

export function ConsentCard({ p, user, act }: { p: Person; user: Persona; act: Act }) {
  if (!user.allJobs) return null;
  const end = retainEnd(p), left = retainDays(p);
  return (
    <Card title="Consent and retention">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {left < 0 && <Banner tone="warning" icon="shield-alert" title={"Retention ended " + -left + " days ago"}>Anonymize the record, or record renewed consent if the candidate agreed to stay in the pool.</Banner>}
        <dl className="jb-dl" style={{ gridTemplateColumns: "120px 1fr" }}>
          <dt>Consent given</dt><dd>{p.consent.date}</dd>
          <dt>How</dt><dd style={{ fontVariantNumeric: "normal" }}>{p.consent.via}</dd>
          <dt>Keep until</dt><dd><span className="shx-row" style={{ gap: 6 }}>{end}{left >= 0 && left <= 60 && <Badge tone="warning" icon="clock">{left} days left</Badge>}</span></dd>
        </dl>
        <span className="shx-small">Policy: {RETAIN} months after the latest consent. Applications in progress are not affected.</span>
        {!user.admin && left <= 60 && (
          <div className="shx-row" style={{ gap: 6 }}>
            <Button size="sm" variant="secondary" icon="file-check" onClick={() => act("patch", { f: (x: Person) => ({ consent: { date: TODAY, via: "Renewed by email, recorded by " + user.name }, log: logE(user, "file-check", "Consent renewed", "kept until " + addM(TODAY, RETAIN))(x) }), title: "Consent renewed", body: "Record kept until " + addM(TODAY, RETAIN) + ".", icon: "file-check" })}>Record renewed consent</Button>
            <Button size="sm" variant="ghost" icon="user-x" onClick={() => act("delete")}>Anonymize…</Button>
          </div>
        )}
      </div>
    </Card>
  );
}

type Ev = { d: string; type: string; icon: string; title: string; sub?: string; app?: string; missing?: boolean; i: number };

export function events(p: Person): Ev[] {
  const ev: Omit<Ev, "i">[] = [];
  p.cvs.forEach((c) => ev.push({ d: c.date, type: "cv", app: c.uses[0] && c.uses[0].app, icon: c.status === "failed" ? "file-warning" : "file-text", title: "CV uploaded · " + c.file, sub: c.by + " · source: " + c.source }));
  p.apps.forEach((a) => {
    ev.push({ d: a.date, type: "app", app: a.id, icon: a.job ? "briefcase" : "archive", title: a.job ? "Added to " + a.title + " #" + a.job : "Added to talent pool", sub: a.job ? "Starts at CV Scan" : a.from });
    if (a.result === "ended") ev.push({ d: a.end || a.date, type: "app", app: a.id, icon: "circle-slash", title: "Ended at " + (a.round || a.stage) + " · " + a.title + " #" + a.job, sub: a.rk ? RL[a.rk] + (a.reason ? " — " + a.reason : "") + (a.by ? " · " + a.by : "") : "Reason not recorded", missing: !a.rk });
    if (a.result === "official") {
      ev.push({ d: a.date, type: "app", app: a.id, icon: "badge-check", title: "Hired · " + a.title, sub: "Became official employee" });
      if (a.end) ev.push({ d: a.end, type: "app", app: a.id, icon: "log-out", title: "Left Zen8labs", sub: p.alumni || "" });
    }
    if (a.result === "open" && a.stage && a.stage !== "CV Scan") ev.push({ d: p.updated, type: "app", app: a.id, icon: "arrow-right-left", title: "Moved to " + (a.round || a.stage) + " · " + a.title + " #" + a.job, sub: "Now: " + a.sub });
    if (a.result === "probation") ev.push({ d: p.updated, type: "app", app: a.id, icon: "user-check", title: "Started probation · " + a.title, sub: a.sub });
  });
  (p.extra || []).forEach((e) => ev.push(e as Omit<Ev, "i">));
  (p.log || []).forEach((e) => ev.push(e as Omit<Ev, "i">));
  return ev.map((e, i) => ({ ...e, i })).sort((a, b) => (+pd(b.d) - +pd(a.d)) || (b.i - a.i));
}

export function HistoryTab({ p, user, act }: { p: Person; user: Persona; act: Act }) {
  const [app, setApp] = React.useState("All positions");
  const [type, setType] = React.useState("all");
  const vis = p.apps.filter((a) => canSeeApp(user, a));
  const label = (a: CandApp) => (a.job ? a.title + " #" + a.job : "Talent pool (" + a.date + ")");
  const all = events(p);
  const sel = vis.find((a) => label(a) === app);
  const T: [string, string][] = [["all", "All"], ["app", "Applications"], ["iv", "Interviews and notes"], ["cv", "CVs"], ["record", "Profile changes"]];
  const rows = all.filter((e) => (!sel || e.app === sel.id) && (type === "all" || e.type === type));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 880 }}>
      <div className="shx-row" style={{ gap: 8, flexWrap: "wrap" }}>
        <Select size="sm" value={app} onChange={(e: any) => setApp(e.target.value)} options={["All positions", ...vis.map(label)]} style={{ width: 280 }} />
        {T.map(([k, l]) => <button key={k} className={"jb-fchip" + (type === k ? " is-on" : "")} onClick={() => setType(k)}>{l}<span>{all.filter((e) => (!sel || e.app === sel.id) && (k === "all" || e.type === k)).length}</span></button>)}
      </div>
      {rows.length === 0
        ? <div className="jb-empty"><Icon name="history" size={20} /><span>No activity of this type{sel ? " in this position" : ""}</span></div>
        : (
          <ol className="mv-tl">
            {rows.map((e, n) => {
              const a = e.app ? p.apps.find((x) => x.id === e.app) : undefined;
              const ok = !a || canSeeApp(user, a);
              const y = e.d.slice(-4);
              const head = n === 0 || y !== rows[n - 1].d.slice(-4);
              return (
                <React.Fragment key={n}>
                  {head && <li className="mv-tl__y">{y}</li>}
                  <li className="mv-tl__i">
                    <span className="mv-tl__ic" data-warn={!!e.missing}><Icon name={ok ? e.icon : "lock"} size={14} /></span>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontWeight: 500, fontSize: 13 }}>{ok ? e.title : "Activity in a position you can’t open"}</span>
                      <span className="shx-small">{ok ? e.sub : a!.title + " · chapter " + a!.chapter}</span>
                      {ok && e.missing && user.allJobs && !user.admin && <span><Button size="sm" variant="ghost" icon="plus" onClick={() => act("tab", "apps")}>Record reason</Button></span>}
                    </div>
                    <span className="sh-num shx-small" style={{ whiteSpace: "nowrap" }}>{e.d}</span>
                  </li>
                </React.Fragment>
              );
            })}
          </ol>
        )}
    </div>
  );
}

export function ReasonCell({ a, user, act }: { a: CandApp; user: Persona; act: Act }) {
  const [dlg, setDlg] = React.useState(false);
  if (a.result !== "ended") return <span className="shx-small">—</span>;
  const can = user.allJobs && !user.admin;
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 170 }}>
      {a.rk
        ? (
          <>
            <span><Badge tone="outline">{RL[a.rk]}</Badge></span>
            {a.reason && <span className="shx-small" style={{ color: "var(--fg-2)" }}>{a.reason}</span>}
            {can && <a href="#" className="shx-small" onClick={(e) => { e.preventDefault(); setDlg(true); }}>Edit</a>}
          </>
        )
        : can
          ? <span><Button size="sm" variant="secondary" icon="plus" onClick={() => setDlg(true)}>Add reason</Button></span>
          : <span className="shx-small">Not recorded</span>}
      {dlg && (
        <ReasonDialog
          a={a} onClose={() => setDlg(false)}
          onOk={(k, n) => { setDlg(false); act("reason", { a, k, n }); }}
        />
      )}
    </div>
  );
}
