"use client";

import * as React from "react";
import { Badge, Banner, Button, Dialog, Icon, Input, Select } from "../position-management-2/ext";
import { COLORS, type Stage, type StageType, type Viewer, type Sub } from "./data";
import type { Say } from "./pipeline-list";

function PlSubChips({ subs }: { subs: Sub[] }) {
  return (
    <span className="pl-subs">
      {subs.map((s) => (
        <Badge key={s.id} tone={s.pass ? "success" : s.def ? "outline" : "neutral"} icon={s.terminal ? "circle-x" : s.pass ? "check" : s.def ? "flag" : undefined}>
          {s.label}
        </Badge>
      ))}
    </span>
  );
}

/** Lowercase code (a-z, 0-9, _) derived from a label and made unique against `taken`. */
function uniqueCode(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "step";
  let c = base;
  for (let i = 2; used.has(c); i += 1) c = base + "_" + i;
  return c;
}

const STYPES: [StageType, string][] = [["none", "None"], ["schedule", "Allow schedule"], ["offer", "Offer"], ["probation", "Probation"]];
const STYPE_HINT: Record<StageType, string> = {
  none: "A regular stage — candidates move through its steps.",
  schedule: "Adds “Schedule interview” on candidates at this stage,.",
  offer: "Offer terms are recorded here. The hire is confirmed when both sides accept.",
  probation: "Tracks start and end dates, extensions and the end-of-probation review.",
};
const STYPE_BADGE: Partial<Record<StageType, [string, string, string]>> = {
  schedule: ["info", "calendar", "Allow schedule"],
  offer: ["brand", "badge-check", "Offer"],
  probation: ["brand", "user-check", "Probation"],
};

function StageEditor({ stage, lib, edit, busy, onClose, onSave, onDelete }: {
  stage: Stage; lib: Stage[]; edit: boolean; busy: boolean; onClose: () => void; onSave: (s: Stage) => void; onDelete: () => void;
}) {
  const isNew = stage.id === "new";
  const [s, setS] = React.useState<Stage>(() => ({ ...stage, subs: stage.subs.map((x) => ({ ...x })) }));
  const [blocked, setBlocked] = React.useState<{ i: number; def?: boolean } | null>(null);
  const set = (p: Partial<Stage>) => setS((x) => ({ ...x, ...p }));
  const up = (i: number, p: Partial<Sub>) =>
    set({ subs: s.subs.map((x, j) => (j === i ? { ...x, ...p } : p.def ? { ...x, def: false } : x)) });
  const mv = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= s.subs.length) return;
    const a = [...s.subs];
    [a[i], a[j]] = [a[j], a[i]];
    set({ subs: a });
  };
  const rmSub = (i: number) => {
    const sub = s.subs[i];
    if (sub.def) return setBlocked({ i, def: true });
    set({ subs: s.subs.filter((_, j) => j !== i) });
  };

  const errs: string[] = [];
  if (!s.label.trim()) errs.push("Give the stage a name.");
  if (s.subs.filter((x) => x.def).length !== 1) errs.push("Every stage needs exactly one entry step.");
  if (s.subs.some((x) => x.withdraw && !x.terminal)) errs.push("A withdraw step must end the application.");
  if (!s.subs.some((x) => x.pass)) errs.push("Mark at least one step as passing — otherwise no one can move forward.");
  if (false) errs.push("Mark at least one step as passing — otherwise no one can move forward.");
  if (s.subs.some((x) => x.def && x.terminal)) errs.push("The entry step can’t end the application.");
  if (s.subs.some((x) => x.pass && x.terminal)) errs.push("A passing step can’t also end the application.");
  if (s.subs.some((x) => !x.label.trim())) errs.push("Every step needs a name.");
  const passN = s.subs.filter((x) => x.pass).length;

  return (
    <>
      <div className="pl-scrim" onClick={onClose} />
      <aside className="pl-drawer" role="dialog" aria-label={"Edit " + stage.label} style={{ width: 720 }}>
        <div className="pl-drawer__h">
          <span className="pl-dot" style={{ background: s.color, marginTop: 7 }} />
          <div style={{ flex: 1 }}>
            <div className="pl-small">Stage library</div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{isNew ? "New stage" : s.label}</h2>
          </div>
          <button type="button" className="sh-iconbtn" aria-label="Close" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div className="pl-drawer__b">
          {!edit && <Banner tone="neutral" icon="lock">Only Admin can change the stage library. Ask Lê Minh Quân for changes.</Banner>}
          <div className="jb-form" style={{ paddingTop: 0 }}>
            <Input label="Name" value={s.label} readOnly={!edit} onChange={(e) => set({ label: e.target.value })} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Color</span>
              <div className="pl-swatches" role="group" aria-label="Color">
                {COLORS.map((c, ci) => (
                  <button key={c} type="button" aria-label={"Color " + (ci + 1)} aria-pressed={s.color === c} disabled={!edit} style={{ background: c }} onClick={() => set({ color: c })} />
                ))}
              </div>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <Input label="Description" hint="Shown to people choosing stages for a position." value={s.desc} readOnly={!edit} onChange={(e) => set({ desc: e.target.value })} />
            </div>
            <Select label="Stage type" value={s.type ?? "none"} disabled={!edit}
              onChange={(e) => { const t = e.target.value as StageType; set({ type: t, schedule: t === "schedule" }); }}
              options={STYPES.map(([v, l]) => ({ value: v, label: l }))}
              hint={STYPE_HINT[s.type ?? "none"] + (stage.schedule && s.type !== "schedule" ? " Not allowed while interviews are still upcoming in this stage — cancel or finish them first." : "")} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <b style={{ fontWeight: 600 }}>Steps</b>
              <span className="pl-small">Candidates are always at one step of their current stage.</span>
            </div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <div className="pl-subed pl-subed--head">
                <span />
                <span>Step</span>
                {["Entry", "Passing", "Ends app.", "Decision", "Reason"].map((h) => <span key={h} style={{ textAlign: "center" }}>{h}</span>)}
                <span />
              </div>
              {s.subs.map((x, i) => (
                <div key={x.id} className="pl-subed">
                  <span style={{ display: "flex", flexDirection: "column" }}>
                    {edit && (
                      <>
                        <button type="button" className="sh-iconbtn sh-iconbtn--sm" style={{ height: 14 }} aria-label="Move step up" onClick={() => mv(i, -1)}><Icon name="chevron-up" size={12} /></button>
                        <button type="button" className="sh-iconbtn sh-iconbtn--sm" style={{ height: 14 }} aria-label="Move step down" onClick={() => mv(i, 1)}><Icon name="chevron-down" size={12} /></button>
                      </>
                    )}
                  </span>
                  <input type="text" value={x.label} readOnly={!edit} aria-label="Step name" onChange={(e) => up(i, { label: e.target.value })} />
                  <input type="radio" name="entry" checked={!!x.def} disabled={!edit} aria-label={"Entry step: " + x.label} onChange={() => up(i, { def: true })} />
                  <input type="checkbox" checked={!!x.pass} disabled={!edit} aria-label={"Passing step: " + x.label} onChange={() => up(i, { pass: !x.pass, terminal: x.pass ? x.terminal : false })} />
                  <input type="checkbox" checked={!!x.terminal} disabled={!edit} aria-label={"Ends application: " + x.label} onChange={() => up(i, { terminal: !x.terminal, pass: !x.terminal ? false : x.pass, reason: !x.terminal ? true : x.reason })} />
                  <input type="checkbox" checked={!!x.decision} disabled={!edit} aria-label={"Needs decision-maker: " + x.label} onChange={() => up(i, { decision: !x.decision })} />
                  <input type="checkbox" checked={!!x.reason} disabled={!edit} aria-label={"Reason required: " + x.label} onChange={() => up(i, { reason: !x.reason })} />
                  {edit ? <button type="button" className="sh-iconbtn sh-iconbtn--sm" aria-label={"Delete step " + x.label} onClick={() => rmSub(i)}><Icon name="trash-2" size={14} /></button> : <span />}
                </div>
              ))}
              {edit && (
                <div style={{ padding: "6px 10px", borderTop: "1px solid var(--border)" }}>
                  <Button size="sm" variant="ghost" icon="plus" onClick={() => set({ subs: [...s.subs, { id: "n" + Date.now(), label: "New step" }] })}>Add step</Button>
                </div>
              )}
            </div>
            <div className="pl-small" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 10px" }}>
              <b>Entry</b><span>Where candidates start when they reach this stage. Exactly one per stage. Going back to the previous stage is only allowed from here.</span>
              <b>Passing</b><span>The candidate passed this stage — unlocks the next stage. At the last stage it allows confirming the hire. Can’t also end the application.</span>
              <b>Ends app.</b><span>Ends the candidate’s application at this position, e.g. Failed, Rejected, Withdrew. The entry and passing steps can’t end the application.</span>
              <b>Decision</b><span>Only a decision-maker (the position’s Chapter Head or HR) can set this step, e.g. Passed or Failed after an interview.</span>
              <b>Reason</b><span>A reason must be entered when setting this step, e.g. why a candidate was rejected.</span>
            </div>
          </div>

          {blocked && (
            <Banner tone="danger" icon="circle-x" title={"Choose another entry step first"}
              action={<Button size="sm" variant="ghost" onClick={() => setBlocked(null)}>OK</Button>}>
              Every stage needs exactly one entry step.
            </Banner>
          )}
          {edit && (errs.length
            ? <div style={{ display: "flex", flexDirection: "column", gap: 4 }} role="alert">{errs.map((e) => <span key={e} className="pl-err"><Icon name="circle-alert" size={14} />{e}</span>)}</div>
            : <span className="pl-ok"><Icon name="circle-check" size={14} />One entry step and {passN} passing step{passN > 1 ? "s" : ""} — valid.</span>)}
        </div>
        {edit && (
          <div className="pl-drawer__f">
            {!isNew && <Button variant="ghost" icon="trash-2" disabled={busy} onClick={onDelete}>Delete stage</Button>}
            <span style={{ flex: 1 }} />
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button icon="check" disabled={errs.length > 0 || busy} onClick={() => onSave(s)}>
              {isNew ? "Add to library" : "Save stage"}
            </Button>
          </div>
        )}
      </aside>
    </>
  );
}

export function StageLibrary({ viewer, lib, setLib, say }: {
  viewer: Viewer; lib: Stage[]; setLib: React.Dispatch<React.SetStateAction<Stage[]>>; say: Say;
}) {
  const [ed, setEd] = React.useState<Stage | null>(null);
  const edit = viewer.canEdit;

  const newStage = (): Stage => ({
    id: "new", label: "", color: "var(--chart-3)", desc: "", schedule: false,
    subs: [{ id: "n1", label: "Pending", def: true }, { id: "n2", label: "Passed", pass: true }, { id: "n3", label: "Failed", terminal: true, reason: true }],
  });

  const [busy, setBusy] = React.useState(false);

  const request = async (url: string, init: RequestInit): Promise<{ stage?: Stage } | null> => {
    setBusy(true);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
      if (!res.ok) {
        say("Couldn’t save", (data as { error?: string }).error ?? "Something went wrong. Try again.", "circle-x");
        return null;
      }
      return data as { stage?: Stage };
    } catch {
      say("Couldn’t save", "Network error. Try again.", "circle-x");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const save = async (s: Stage) => {
    const isNew = s.id === "new";
    const code = isNew ? uniqueCode(s.label, lib.map((x) => x.id)) : s.id;
    const kept = new Set(lib.find((x) => x.id === s.id)?.subs.map((x) => x.id));
    const taken = new Set<string>();
    const subs = s.subs.map((x) => {
      const c = kept.has(x.id) ? x.id : uniqueCode(x.label, [...taken, ...kept]);
      taken.add(c);
      return { code: c, label: x.label.trim(), def: !!x.def, pass: !!x.pass, terminal: !!x.terminal, reason: !!x.reason, decision: !!x.decision, withdraw: !!x.withdraw };
    });
    const body = JSON.stringify({ ...(isNew ? { code } : {}), label: s.label.trim(), desc: s.desc, color: s.color, type: s.type ?? "none", subs });
    const out = await request(isNew ? "/api/admin/pipelines/library" : "/api/admin/pipelines/library/" + encodeURIComponent(code), { method: isNew ? "POST" : "PUT", body });
    if (!out?.stage) return;
    const saved = out.stage;
    setLib((l) => (isNew ? [...l, saved] : l.map((x) => (x.id === saved.id ? saved : x))));
    setEd(null);
    say(isNew ? saved.label + " added to the library" : saved.label + " updated",
      isNew ? "Positions can now add it to their pipeline." : "Recorded in the audit log.", "check");
  };

  const [ask, setAsk] = React.useState<Stage | null>(null);
  const tryDelete = async (s: Stage) => {
    const out = await request("/api/admin/pipelines/library/" + encodeURIComponent(s.id), { method: "DELETE" });
    if (!out) return;
    setLib((l) => l.filter((x) => x.id !== s.id));
    setEd(null);
    say("Stage deleted", s.label, "trash-2");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 1320 }}>
      <div className="pl-toolbar">
        <span className="pl-small" style={{ flex: 1 }}>Stages and their steps are shared company-wide. Pipelines pick stages from here and set their order.</span>
        {edit ? <Button size="sm" icon="plus" onClick={() => setEd(newStage())}>New stage</Button>
          : <Badge tone="outline" icon="lock">View only · managed by Admin</Badge>}
      </div>
      <section className="pl-card" style={{ overflowX: "auto" }}>
        <div className="pl-lib pl-lib--head"><span /><span>Stage</span><span>Steps</span><span>Type</span><span /></div>
        {lib.filter((s) => !s.deleted).map((s) => (
          <div key={s.id} className="pl-lib">
            <span className="pl-dot" style={{ background: s.color, width: 12, height: 12 }} />
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><b style={{ fontWeight: 600 }}>{s.label}</b><span className="pl-small">{s.desc}</span></span>
            <PlSubChips subs={s.subs} />
            <span>{s.type && STYPE_BADGE[s.type] ? <Badge tone={STYPE_BADGE[s.type]![0] as never} icon={STYPE_BADGE[s.type]![1]}>{STYPE_BADGE[s.type]![2]}</Badge> : <span className="pl-small">None</span>}</span>
            <button type="button" className="sh-iconbtn sh-iconbtn--sm" aria-label={(edit ? "Edit " : "View ") + s.label} onClick={() => setEd(s)}>
              <Icon name={edit ? "pencil" : "eye"} size={14} />
            </button>
          </div>
        ))}
      </section>
      {ed && <StageEditor key={ed.id} stage={ed} lib={lib} edit={edit} onClose={() => setEd(null)} busy={busy} onSave={save} onDelete={() => setAsk(ed)} />}
      {ask && (
        <Dialog
          width={440} title={"Delete " + ask.label + "?"}
          description="The stage leaves the library and can’t be picked for new positions or pipelines. Where it is already used (pipelines, positions, candidates) it stays visible, marked as deleted, and can no longer be edited."
          onClose={() => setAsk(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setAsk(null)}>Cancel</Button>
              <Button variant="danger" disabled={busy} onClick={async () => { const s = ask; setAsk(null); await tryDelete(s); }}>Delete stage</Button>
            </>
          }
        >{null}</Dialog>
      )}
    </div>
  );
}
