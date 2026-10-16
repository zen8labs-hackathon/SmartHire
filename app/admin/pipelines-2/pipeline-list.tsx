"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Badge, Banner, Button, Dialog, Icon, Input, Menu } from "../position-management-2/ext";
import {
  type Pipeline, type PipeRow, type Viewer, type Stage, type Sub,
  mkRow, stageById,
} from "./data";

export type Say = (title: string, body?: string, icon?: string) => void;

const badSla = (v: number) => !Number.isInteger(v) || v < 0 || v > 60;

function StepFlow({ st }: { st: Stage }) {
  const flow = st.subs.filter((s) => !s.terminal);
  const ends = st.subs.filter((s) => s.terminal);
  return (
    <div className="p2-flow">
      {flow.map((s: Sub, i) => (
        <React.Fragment key={s.id}>
          {i > 0 && <span className="p2-flow__sep"><Icon name="chevron-right" size={12} /></span>}
          <span className={"p2-step" + (s.def ? " is-entry" : "") + (s.pass ? " is-pass" : "")} title={s.def ? "Entry step" : s.pass ? "Passing step" : undefined}>
            {s.def && <Icon name="flag" size={11} />}
            {s.pass && <Icon name="check" size={11} />}
            {s.label}
          </span>
        </React.Fragment>
      ))}
      {ends.length > 0 && (
        <span className="p2-flow__ends">
          <span className="p2-small">Ends</span>
          {ends.map((s) => (
            <span key={s.id} className="p2-step is-end"><Icon name="circle-x" size={11} />{s.label}</span>
          ))}
        </span>
      )}
    </div>
  );
}

function Chain({ lib, stages }: { lib: Stage[]; stages: PipeRow[] }) {
  return (
    <div className="p2-tflow">
      {stages.map((r, i) => {
        const st = stageById(lib, r.sid);
        return (
          <React.Fragment key={r.sid}>
            {i > 0 && <span className="p2-flow__sep"><Icon name="chevron-right" size={12} /></span>}
            <span className="s">
              <span className="p2-dot" style={{ background: st.color }} />
              {st.label}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function AddStage({ unused, onAdd }: { unused: Stage[]; onAdd: (sid: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top?: number; bottom?: number; left: number; maxH: number } | null>(null);
  // The sequence scroller clips absolute children, so the menu is portalled and fixed to the viewport.
  React.useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 16;
    const above = r.top - 16;
    const up = below < 220 && above > below;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 288));
    setPos(up
      ? { bottom: window.innerHeight - r.top + 4, left, maxH: Math.min(360, above) }
      : { top: r.bottom + 4, left, maxH: Math.min(360, below) });
  }, [open]);
  React.useEffect(() => {
    if (!open) return;
    const md = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const kd = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", md);
    document.addEventListener("keydown", kd);
    return () => { document.removeEventListener("mousedown", md); document.removeEventListener("keydown", kd); };
  }, [open]);
  return (
    <div className="p2-addstage" ref={ref}>
      <Button variant="ghost" size="sm" icon="plus" disabled={!unused.length} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Add stage
      </Button>
      {!unused.length && <span className="p2-small">Every library stage is already in this pipeline.</span>}
      {open && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left, zIndex: 1000, minWidth: 260, maxHeight: pos.maxH, overflowY: "auto" }}
        >
          <Menu
            items={unused.map((s) => ({
              label: s.label + " · " + s.subs.length + " steps",
              icon: "circle-dot",
              onClick: () => { onAdd(s.id); setOpen(false); },
            }))}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}

function Sequence({ lib, rows, setRows, edit }: { lib: Stage[]; rows: PipeRow[]; setRows: (r: PipeRow[]) => void; edit: boolean }) {
  const [drag, setDrag] = React.useState<number | null>(null);
  const [over, setOver] = React.useState<number | null>(null);
  const move = (f: number, t: number) => {
    if (t < 0 || t >= rows.length || f === t) return;
    const m = [...rows];
    const [x] = m.splice(f, 1);
    m.splice(t, 0, x);
    setRows(m);
  };
  const up = (sid: string, p: Partial<PipeRow>) => setRows(rows.map((r) => (r.sid === sid ? { ...r, ...p } : r)));
  const unused = lib.filter((s) => !rows.some((r) => r.sid === s.id));

  const renderRow = (r: PipeRow, mi: number) => {
    const st = stageById(lib, r.sid);
    const err = badSla(r.sla);
    const draggable = edit;
    return (
      <div
        key={r.sid}
        role="listitem"
        className={"p2-row p2-row--np" + (drag === mi ? " is-drag" : "") + (over === mi && drag !== null ? " is-over" : "")}
        draggable={draggable}
        onDragStart={draggable ? () => setDrag(mi) : undefined}
        onDragEnd={draggable ? () => { setDrag(null); setOver(null); } : undefined}
        onDragOver={draggable ? (e) => { e.preventDefault(); setOver(mi); } : undefined}
        onDrop={draggable ? () => { if (drag !== null) move(drag, mi); setDrag(null); setOver(null); } : undefined}
      >
        <span className="p2-grip"><Icon name="grip-vertical" size={14} /></span>
        <span className="p2-idx">{rows.indexOf(r) + 1}</span>
        <div className="p2-info">
          <div className="p2-name">
            <b><span className="p2-dot" style={{ background: st.color }} />{st.label}</b>
          </div>
          <StepFlow st={st} />
        </div>
        <div className="p2-sla">
          <div className="p2-sla__f">
            <input
              type="number" min={0} max={60} value={Number.isNaN(r.sla) ? "" : r.sla} disabled={!edit}
              aria-invalid={err} aria-label={st.label + " time limit in days"}
              onChange={(e) => up(r.sid, { sla: e.target.value === "" ? NaN : Number(e.target.value) })}
            />
            <span className="p2-small">days</span>
          </div>
          {err && <span className="p2-err">Use 0–60 days</span>}
        </div>
        <div className="p2-acts">
          {edit && (
            <>
              <button type="button" className="sh-iconbtn sh-iconbtn--sm" aria-label={"Move " + st.label + " up"} disabled={mi === 0} onClick={() => move(mi, mi - 1)}><Icon name="arrow-up" size={14} /></button>
              <button type="button" className="sh-iconbtn sh-iconbtn--sm" aria-label={"Move " + st.label + " down"} disabled={mi === rows.length - 1} onClick={() => move(mi, mi + 1)}><Icon name="arrow-down" size={14} /></button>
              <button type="button" className="sh-iconbtn sh-iconbtn--sm" aria-label={"Remove " + st.label} onClick={() => setRows(rows.filter((x) => x.sid !== r.sid))}><Icon name="trash-2" size={14} /></button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p2-seqwrap">
      <div className="p2-seq" role="list">
        <div className="p2-row p2-row--np p2-row--head">
          {["", "#", "Stage and steps", "Time limit", ""].map((h, i) => <span key={i}>{h}</span>)}
        </div>
        <div className="p2-grp">
          <b>Stages</b>
          <span>
            {rows.length ? rows.length + (rows.length === 1 ? " stage" : " stages") + (edit ? " · drag or use the arrows to reorder" : "") : "Add at least one stage from the library"}
          </span>
        </div>
        {rows.map((r, i) => renderRow(r, i))}
        {edit && (
          <div className="p2-addrow">
            <AddStage unused={unused} onAdd={(sid) => setRows([...rows, mkRow(lib, sid)])} />
          </div>
        )}
      </div>
    </div>
  );
}

function Editor({ viewer, lib, pipe, list, busy, onClose, onSave }: {
  viewer: Viewer; lib: Stage[]; pipe: Pipeline | null; list: Pipeline[]; onClose: () => void;
  busy: boolean; onSave: (name: string, rows: PipeRow[], isNew: boolean) => void;
}) {
  const isNew = !pipe;
  const [name, setName] = React.useState(pipe?.name ?? "");
  const [rows, setRows] = React.useState<PipeRow[]>(() => (pipe ? pipe.stages.map((r) => ({ ...r })) : []));
  const [leave, setLeave] = React.useState(false);
  const edit = viewer.canEdit;
  const orig = React.useMemo(() => JSON.stringify([pipe?.name ?? "", pipe ? pipe.stages : []]), [pipe]);
  const dirty = JSON.stringify([name, rows]) !== orig;
  const nm = name.trim();
  const dup = !!nm && list.some((p) => p.id !== pipe?.id && p.name.trim().toLowerCase() === nm.toLowerCase());
  const problems = [
    !nm && "Give the pipeline a name",
    dup && "Another pipeline already has this name",
    !rows.length && "Add at least one stage",
    rows.some((r) => badSla(r.sla)) && "Fix time limits",
  ].filter(Boolean) as string[];
  const close = () => (dirty && edit ? setLeave(true) : onClose());

  return (
    <>
      <Dialog
        width={1040}
        title={isNew ? "Create pipeline" : edit ? "Edit pipeline" : pipe!.name}
        description={isNew ? "Name it, then add stages from the Stage library and put them in order." : "Updated by " + pipe!.by + " on " + pipe!.at + " · " + rows.length + " stages"}
        onClose={close}
        footer={
          edit ? (
            <>
              <span className="p2-err" style={{ marginRight: "auto" }}>{problems[0]}</span>
              <Button variant="secondary" onClick={close}>Cancel</Button>
              <Button icon="check" disabled={problems.length > 0 || (!isNew && !dirty) || busy}
                onClick={() => onSave(nm, rows, isNew)}>
                {isNew ? "Create pipeline" : "Save pipeline"}
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={onClose}>Close</Button>
          )
        }
      >
        <div className="p2-col" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {!edit && (
            <Banner tone="neutral" icon="lock" title="Only HR and Admin can create or change pipelines">
              You can see the stages and time limits.
            </Banner>
          )}
          {edit && (
            <div className="p2-namefield">
              <Input label="Pipeline name" placeholder="e.g. Full-time standard" value={name} onChange={(e) => setName(e.target.value)} error={dup ? "Another pipeline already has this name" : undefined} />
            </div>
          )}
          <div className="p2-seqbox">
            <Sequence lib={lib} rows={rows} setRows={setRows} edit={edit} />
            <div className="p2-legend">
              <span><Icon name="flag" size={12} />Entry step</span>
              <span><Icon name="check" size={12} />Passing step — unlocks the next stage</span>
              <span><Icon name="circle-x" size={12} />Ends the application</span>
              <span style={{ marginLeft: "auto" }}>To change stages or steps, use the Stage library.</span>
            </div>
          </div>
        </div>
      </Dialog>
      {leave && (
        <Dialog
          width={440} title="Discard unsaved changes?"
          description={isNew ? "This pipeline hasn’t been created yet." : "Your changes to " + pipe!.name + " will be lost."}
          onClose={() => setLeave(false)}
          footer={<><Button variant="secondary" onClick={() => setLeave(false)}>Keep editing</Button><Button variant="danger" onClick={onClose}>Discard</Button></>}
        >{null}</Dialog>
      )}
    </>
  );
}

export function PipelineList({ viewer, lib, list, setList, say }: {
  viewer: Viewer; lib: Stage[]; list: Pipeline[]; setList: React.Dispatch<React.SetStateAction<Pipeline[]>>; say: Say;
}) {
  const [open, setOpen] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [del, setDel] = React.useState<Pipeline | null>(null);
  const edit = viewer.canEdit;
  const shown = list.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const cur = open && open !== "new" ? list.find((p) => p.id === open) ?? null : null;

  const [busy, setBusy] = React.useState(false);

  const call = async (url: string, method: string, body?: unknown): Promise<{ pipeline?: Pipeline } | null> => {
    setBusy(true);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
      if (!res.ok) {
        say("Couldn’t save", (data as { error?: string }).error ?? "Something went wrong. Try again.", "circle-x");
        return null;
      }
      return data as { pipeline?: Pipeline };
    } catch {
      say("Couldn’t save", "Network error. Try again.", "circle-x");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const save = async (name: string, rows: PipeRow[], isNew: boolean) => {
    const body = { name, rows: rows.map((r) => ({ stageCode: r.sid, slaDays: r.sla, schedule: r.sch })) };
    const out = await call(isNew ? "/api/admin/pipelines/list" : "/api/admin/pipelines/list/" + cur!.id, isNew ? "POST" : "PATCH", body);
    const p = out?.pipeline;
    if (!p) return;
    setList((l) => (isNew ? [...l, p] : l.map((x) => (x.id === p.id ? p : x))));
    setOpen(null);
    say(isNew ? "Pipeline created" : "Pipeline saved", p.name + " · " + p.stages.length + " stages", "check");
  };

  const remove = async (p: Pipeline) => {
    if (!(await call("/api/admin/pipelines/list/" + p.id, "DELETE"))) return;
    setList((l) => l.filter((x) => x.id !== p.id));
    say("Pipeline deleted", p.name, "trash-2");
    setDel(null);
  };

  return (
    <div className="p2-col" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="pl-toolbar">
        <label className="p2-search__f" style={{ width: 280 }}>
          <span><Icon name="search" size={14} /></span>
          <input className="p2-searchin" placeholder="Search pipelines" aria-label="Search pipelines" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <span className="p2-small" style={{ flex: 1 }}>Build a pipeline from stages in the library. Pipelines aren’t attached to any position until a position chooses one.</span>
        {edit && <Button size="sm" icon="plus" onClick={() => setOpen("new")}>Create pipeline</Button>}
      </div>
      <section className="pl-card" style={{ overflowX: "auto" }}>
        <div className="p2-plist p2-plist--head"><span>Pipeline</span><span>Stages</span><span>Updated</span><span /></div>
        {shown.map((p) => (
          <div key={p.id} className="p2-plist" role="button" tabIndex={0} onClick={() => setOpen(p.id)}
            onKeyDown={(e) => { if (e.key === "Enter") setOpen(p.id); }}>
            <div className="p2-plist__n"><b>{p.name}</b><span className="p2-small">{p.stages.length} stages</span></div>
            <Chain lib={lib} stages={p.stages} />
            <span className="p2-small">{p.by}<br />{p.at}</span>
            <div className="p2-acts">
              {edit && (
                <button type="button" className="sh-iconbtn sh-iconbtn--sm" aria-label={"Delete " + p.name} onClick={(e) => { e.stopPropagation(); setDel(p); }}>
                  <Icon name="trash-2" size={14} />
                </button>
              )}
              <Icon name="chevron-right" size={14} />
            </div>
          </div>
        ))}
        {shown.length === 0 && (
          <div className="p2-empty">
            <span className="p2-empty__ic"><Icon name="workflow" size={20} /></span>
            <b>{list.length ? "No pipelines match" : "No pipelines yet"}</b>
            {!list.length && edit && <Button icon="plus" onClick={() => setOpen("new")}>Create pipeline</Button>}
          </div>
        )}
      </section>
      {open && (open === "new" || cur) && (
        <Editor key={open} viewer={viewer} lib={lib} pipe={cur} list={list} busy={busy} onClose={() => setOpen(null)} onSave={save} />
      )}
      {del && (
        <Dialog
          width={440} title={"Delete " + del.name + "?"}
          description="The pipeline is removed from the list. Stages and steps in the library don’t change."
          onClose={() => setDel(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDel(null)}>Cancel</Button>
              <Button variant="danger" disabled={busy} onClick={() => remove(del)}>Delete pipeline</Button>
            </>
          }
        >{null}</Dialog>
      )}
    </div>
  );
}

export { Badge };
