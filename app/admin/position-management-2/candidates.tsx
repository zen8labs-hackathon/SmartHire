"use client";

import * as React from "react";
import { STAGES, srcInfo, type AttentionItem, type Candidate, type Criterion, type Role, type Stage } from "./data";
import { MoveButton, Pop, StageChip, StagePath, moveItems, stageOf, type MoveHandlers } from "./shell";
import {
  AIBadge, AIRationale, ActivityTimeline, ApplicationRow, Avatar, Badge, Banner, Button, CVVersionItem, CandidateHeader, Checkbox, CriterionResult,
  EntityTabs, FileStatus, FileStatusRow, HiddenScoreNotice, Icon, IdentityTag, InterviewNoteEditor, KanbanCard, KanbanColumn, MatchBand,
  MatchStatusInline, MoveToMenu, RestrictedValue, ScoreComposition, Table, Tabs, lsGet, lsSet, type BandKey, type Column, type CritResult,
  type FileStatusKey,
} from "./ext";

type Style = React.CSSProperties;

export type CandHandlers = MoveHandlers & {
  onBulk: (sel: number[], kind: string, done?: () => void) => void;
  onAttention: (a: Partial<AttentionItem>, action: string) => void;
};
export type OpenCand = (id: number, ids: number[], label: string, review?: boolean) => void;
export type NextStep = { mine: boolean } | null;
export type CandPreset = { mine?: boolean; stage?: string[]; band?: string[]; source?: string[]; scoring?: string[] };

const ON: Style = { background: "var(--accent)", color: "#fff" };

export function MatchCell({ c, user, onRescore }: { c: Candidate; user?: Role; onRescore?: () => void }) {
  if (user && user.hideScore && !c.ivDone) return <span className="shx-lock"><Icon name="eye-off" size={12} />Hidden until notes</span>;
  if (c.st !== "done") return <MatchStatusInline status={c.st} name={c.name} onRescore={onRescore} />;
  return <MatchBand band={c.band} score={c.score} />;
}

function Flags({ c }: { c: Candidate }) {
  const f = c.flags || [];
  return <>{f.includes("prev") && <IdentityTag kind="existing" since="03/2025" />}{f.includes("alumni") && <IdentityTag kind="alumni" />}{c.stage === "hired" && <IdentityTag kind="hired" />}</>;
}

const BAND_OPTS: [string, string][] = [["strong", "Strong match"], ["good", "Good match"], ["partial", "Partial"], ["limited", "Limited"], ["review", "Needs manual review"]];
const SCORE_OPTS: [string, string][] = [["done", "Scored"], ["scoring", "Scoring"], ["error", "Scoring failed"], ["none", "Not scored"]];

function FilterFooter({ draft, onClear, onApply }: { draft: string[]; onClear: () => void; onApply: () => void }) {
  return (
    <div className="shx-row" style={{ padding: "8px 12px", borderTop: "1px solid var(--border)" }}>
      <button type="button" className="sh-btn sh-btn--ghost sh-btn--sm" disabled={!draft.length} onClick={onClear}>Clear</button>
      <span className="shx-sp" />
      <Button size="sm" onClick={onApply}>Apply</Button>
    </div>
  );
}

function OptLabel({ text, n }: { text: React.ReactNode; n: number }) {
  return <span className="shx-row" style={{ flex: 1 }}><span style={{ flex: 1, minWidth: 0 }}>{text}</span><span className="shx-small shx-mono">{n}</span></span>;
}

function StageFilter({ value, onChange, count, stages = STAGES }: { value: string[]; onChange: (v: string[]) => void; count: (k: string, sb?: string) => number; stages?: Stage[] }) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const toggleOpen = () => { if (!open) setDraft(value); setOpen(!open); };
  const S = stages;
  const keys = (s: (typeof S)[number]) => s.subs.map((x) => s.id + ":" + x);
  const togStage = (s: (typeof S)[number]) => setDraft((d) => { const k = keys(s), all = k.every((x) => d.includes(x)); return all ? d.filter((x) => !k.includes(x)) : [...new Set([...d, ...k])]; });
  const tog = (k: string) => setDraft((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k]));
  const n = value.length;
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <Button size="sm" variant="secondary" iconRight="chevron-down" aria-expanded={open} aria-haspopup="dialog" onClick={toggleOpen} className={n ? "jb-fbtn--on" : ""}>
        Stage{n > 0 && <span className="shx-cnt" style={ON}>{n}</span>}
      </Button>
      <Pop open={open} onClose={() => setOpen(false)} top={34} width={300}>
        <div className="sh-popover jb-fpop" role="dialog" aria-label="Filter by stage and sub-stage">
          <div className="jb-overline" style={{ padding: "8px 12px 4px" }}>Stage and sub-stage</div>
          <div style={{ display: "flex", flexDirection: "column", padding: "0 4px 6px", maxHeight: 420, overflow: "auto" }}>
            {S.map((s) => {
              const k = keys(s), on = k.filter((x) => draft.includes(x)).length;
              return (
                <div key={s.id} className="jb-ftree">
                  <Checkbox
                    className="jb-fopt" checked={on === k.length} onChange={() => togStage(s)}
                    label={
                      <span className="shx-row" style={{ flex: 1 }}>
                        <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{s.label}{on > 0 && on < k.length && <span className="shx-small" style={{ fontWeight: 400 }}> · {on} of {k.length}</span>}</span>
                        <span className="shx-small shx-mono">{count(s.id)}</span>
                      </span>
                    }
                  />
                  {s.subs.length > 1 && (
                    <div className="jb-ftree__subs">
                      {s.subs.map((sb) => <Checkbox key={sb} className="jb-fopt" checked={draft.includes(s.id + ":" + sb)} onChange={() => tog(s.id + ":" + sb)} label={<OptLabel text={sb} n={count(s.id, sb)} />} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <FilterFooter draft={draft} onClear={() => setDraft([])} onApply={() => { onChange(draft); setOpen(false); }} />
        </div>
      </Pop>
    </span>
  );
}

const stageChips = (v: string[], stages: Stage[] = STAGES): [string, string, string][] =>
  stages.flatMap((s) => {
    const k = s.subs.map((x) => s.id + ":" + x), on = k.filter((x) => v.includes(x));
    if (!on.length) return [];
    return on.length === k.length && k.length > 1 ? [["g", s.id, s.label] as [string, string, string]] : on.map((x) => ["g", x, s.label + " - " + x.split(":")[1]] as [string, string, string]);
  });

export function FilterSelect({ label, options, value, onChange, count, render }: {
  label: string; options: [string, string][]; value: string[]; onChange: (v: string[]) => void; count: (k: string) => number; render?: (k: string, l: string) => React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const toggleOpen = () => { if (!open) setDraft(value); setOpen(!open); };
  const tog = (k: string) => setDraft((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k]));
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <Button size="sm" variant="secondary" iconRight="chevron-down" aria-expanded={open} aria-haspopup="dialog" onClick={toggleOpen} className={value.length ? "jb-fbtn--on" : ""}>
        {label}{value.length > 0 && <span className="shx-cnt" style={ON}>{value.length}</span>}
      </Button>
      <Pop open={open} onClose={() => setOpen(false)} top={34} width={260}>
        <div className="sh-popover jb-fpop" role="dialog" aria-label={"Filter by " + label}>
          <div className="jb-overline" style={{ padding: "8px 12px 4px" }}>{label}</div>
          <div style={{ display: "flex", flexDirection: "column", padding: "0 4px 6px" }}>
            {options.map(([k, l]) => <Checkbox key={k} className="jb-fopt" checked={draft.includes(k)} onChange={() => tog(k)} label={<OptLabel text={render ? render(k, l) : l} n={count(k)} />} />)}
          </div>
          <FilterFooter draft={draft} onClear={() => setDraft([])} onApply={() => { onChange(draft); setOpen(false); }} />
        </div>
      </Pop>
    </span>
  );
}

export function CandidatesTab({ user, cands, h, view, setView, open, compact, nextOf, preset, stages = STAGES }: {
  user: Role; cands: Candidate[]; h: CandHandlers; view: string; setView: (v: string) => void; isPool?: boolean; open: OpenCand;
  compact?: boolean; nextOf?: (c: Candidate) => NextStep; preset?: CandPreset; stages?: Stage[];
}) {
  const P0 = preset || {};
  const [sel, setSel] = React.useState<number[]>([]);
  const [mineOnly, setMineOnly] = React.useState(!!P0.mine);
  const [fStage, setFStage] = React.useState<string[]>(P0.stage || []);
  const [menuFor, setMenuFor] = React.useState<number | null>(null);
  const [fBand, setFBand] = React.useState<string[]>(P0.band || []);
  const [fSrc, setFSrc] = React.useState<string[]>(P0.source || []);
  const [fScore, setFScore] = React.useState<string[]>(P0.scoring || []);
  const S = stages;
  const isMine = (c: Candidate) => !!(nextOf && nextOf(c)?.mine);
  const scoreKey = (c: Candidate) => (c.st === "done" ? "done" : c.st || "none");
  const pass = (c: Candidate, skip?: string) =>
    (skip === "g" || !fStage.length || fStage.includes(c.stage + ":" + c.sub)) &&
    (skip === "b" || !fBand.length || (c.st === "done" && !!c.band && fBand.includes(c.band))) &&
    (skip === "s" || !fSrc.length || fSrc.includes(c.source)) &&
    (skip === "k" || !fScore.length || fScore.includes(scoreKey(c)));
  const base = cands;
  const mineCount = nextOf ? base.filter((c) => pass(c) && isMine(c)).length : 0;
  const rows = base.filter((c) => pass(c) && (!mineOnly || isMine(c)));
  const sources = [...new Set(cands.map((c) => c.source))].sort().map((x) => [x, x] as [string, string]);
  const optLabel = (opts: [string, string][], k: string) => opts.find((o) => o[0] === k)?.[1] ?? k;
  const active: [string, string, string][] = [
    ...stageChips(fStage, S),
    ...fBand.map((k) => ["b", k, optLabel(BAND_OPTS, k)] as [string, string, string]),
    ...fSrc.map((k) => ["s", k, k] as [string, string, string]),
    ...fScore.map((k) => ["k", k, optLabel(SCORE_OPTS, k)] as [string, string, string]),
  ];
  const setters: Record<string, React.Dispatch<React.SetStateAction<string[]>>> = { g: setFStage, b: setFBand, s: setFSrc, k: setFScore };
  const drop = (t: string, k: string) => setters[t]((v) => v.filter((x) => (t === "g" && !k.includes(":") ? !x.startsWith(k + ":") : x !== k)));
  const clearAll = () => { setFStage([]); setFBand([]); setFSrc([]); setFScore([]); };
  const rescore = (c: Candidate) => () => h.onAttention({ id: "a5", cand: c.id }, "Rescore");
  const cols: Column<Candidate>[] = [
    {
      key: "name", label: "Candidate", render: (c) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><b style={{ fontWeight: 600 }}>{c.name}</b><Flags c={c} /></span>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{c.headline}</span>
        </div>
      ),
    },
    { key: "stage", label: "Stage", render: (c) => <StageChip stage={c.stage} sub={c.sub} stages={S} /> },
    { key: "match", label: "Match", render: (c) => <MatchCell c={c} user={user} onRescore={user.key !== "iv" ? rescore(c) : undefined} /> },
    { key: "source", label: "Source", render: (c) => { const [cls, ic] = srcInfo(c.source); return <span className={"src-chip src--" + cls}><Icon name={ic} size={12} />{c.source}</span>; } },
    ...(user.salary ? [{ key: "salary", label: "Expected salary", align: "right", render: (c) => <span className="sh-num">{c.salary}</span> } as Column<Candidate>] : []),
    { key: "applied", label: "Added", align: "right", render: (c) => c.applied },
    {
      key: "days", label: "Days in stage", align: "right", render: (c) => (
        <span style={c.days > 7 ? { color: "var(--warning)", fontWeight: 600 } : undefined}>
          {c.days > 7 && <Icon name="triangle-alert" size={12} style={{ marginRight: 4, verticalAlign: -1 }} />}{c.days}
        </span>
      ),
    },
    ...(user.key !== "iv" ? [{ key: "act", label: "", render: (c) => <MoveButton c={c} h={h} user={user} label="Move" stages={S} /> } as Column<Candidate>] : []),
  ];
  const scoring = cands.filter((c) => c.st === "scoring").length;
  const listLabel = active.length ? "Filtered list" : "All candidates";
  const hiddenCol = !user.salary && user.key !== "iv";
  const closeMenu = <A extends unknown[]>(f: (...a: A) => void) => (...a: A) => { setMenuFor(null); f(...a); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: sel.length ? 80 : 0 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Tabs variant="segmented" value={view} onChange={setView} tabs={[{ id: "list", label: "List" }, { id: "board", label: "Board" }]} />
        <span style={{ width: 1, height: 20, background: "var(--border)" }} />
        <StageFilter stages={S} value={fStage} onChange={setFStage} count={(k, sb) => base.filter((c) => pass(c, "g") && c.stage === k && (!sb || c.sub === sb)).length} />
        {!user.hideScore && (
          <FilterSelect label="Match band" options={BAND_OPTS} value={fBand} onChange={setFBand} count={(k) => base.filter((c) => pass(c, "b") && c.st === "done" && c.band === k).length} render={(k) => <MatchBand band={k as BandKey} compact />} />
        )}
        {nextOf && (
          <Button size="sm" variant="secondary" icon="circle-arrow-right" aria-pressed={mineOnly} onClick={() => setMineOnly(!mineOnly)} className={mineOnly ? "jb-fbtn--on" : ""}>
            Waiting on me<span className="shx-cnt" style={mineOnly ? ON : undefined}>{mineCount}</span>
          </Button>
        )}
        <FilterSelect label="Source" options={sources} value={fSrc} onChange={setFSrc} count={(k) => base.filter((c) => pass(c, "s") && c.source === k).length} />
        {user.key !== "iv" && rows.length > 0 && (
          <>
            <span className="ad-sp" />
            <Button size="sm" variant="secondary" icon="list-checks" onClick={() => open(rows[0].id, rows.map((r) => r.id), listLabel, true)}>Review one by one · {rows.length}</Button>
          </>
        )}
        {!user.hideScore && (
          <FilterSelect
            label="Scoring" options={SCORE_OPTS} value={fScore} onChange={setFScore} count={(k) => base.filter((c) => pass(c, "k") && scoreKey(c) === k).length}
            render={(k, l) => (k === "done" ? <Badge tone="success" icon="check">{l}</Badge> : <MatchStatusInline status={k} />)}
          />
        )}
      </div>
      {active.length > 0 && (
        <div className="shx-row" style={{ flexWrap: "wrap", gap: 6 }}>
          <span className="shx-small">{rows.length} of {base.length} shown ·</span>
          {active.map(([t, k, l]) => (
            <span key={t + k} className="jb-achip">
              {({ g: "Stage", b: "Match", s: "Source", k: "Scoring" } as Record<string, string>)[t]}: {l}
              <button type="button" aria-label={"Remove filter " + l} onClick={() => drop(t, k)}><Icon name="x" size={12} /></button>
            </span>
          ))}
          <button type="button" className="sh-btn sh-btn--ghost sh-btn--sm" onClick={clearAll}>Clear all</button>
        </div>
      )}
      <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 12, color: "var(--muted)", flexWrap: "wrap" }}>
        <span>Sorted by newest · match is one signal, not a ranking</span>
        {scoring > 0 && <FileStatus status="processing" label={scoring + " still scoring"} />}
        {hiddenCol && <RestrictedValue inline label="Expected salary column hidden" reason="Only HR, Admin and the position's Chapter Head can see salary." />}
        {user.key === "iv" && <span>Showing the {cands.length} candidates you are scheduled to interview</span>}
      </div>
      {rows.length === 0 && active.length > 0 ? (
        <div className="jb-empty">
          <Icon name="funnel-x" size={20} />
          <b>No candidates match these filters</b>
          <button type="button" className="sh-btn sh-btn--secondary sh-btn--sm" onClick={clearAll}>Clear filters</button>
        </div>
      ) : view === "list" ? (
        <Table
          compact={compact} selectable={user.key !== "iv"} selected={sel} onSelect={(ids) => setSel(ids as number[])} columns={cols} rows={rows}
          onRowClick={(c) => open(c.id, rows.map((r) => r.id), listLabel)}
        />
      ) : (
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", overflowX: "auto", paddingBottom: 8 }}>
          {S.filter((st) => !fStage.length || fStage.some((x) => x.startsWith(st.id + ":"))).map((st) => {
            const list = rows.filter((c) => c.stage === st.id);
            const card = (c: Candidate) => (
              <div key={c.id} style={{ position: "relative" }}>
                <KanbanCard
                  name={c.name} headline={c.headline} band={c.band} status={c.st} days={c.days} notes={c.notes} hired={c.stage === "hired"}
                  hideScore={user.hideScore && !c.ivDone} lifted={menuFor === c.id} onClick={() => open(c.id, list.map((r) => r.id), st.label)}
                  onMove={user.key === "iv" ? undefined : () => setMenuFor(menuFor === c.id ? null : c.id)}
                />
                <Pop open={menuFor === c.id} onClose={() => setMenuFor(null)} top={36} width={300}>
                  <MoveToMenu items={moveItems(c, { onMove: closeMenu(h.onMove), onSub: closeMenu(h.onSub), onReject: closeMenu(h.onReject) }, user, S)} />
                </Pop>
              </div>
            );
            return (
              <div key={st.id} className="stc-col" style={{ "--stc": st.color } as Style}>
                <KanbanColumn
                  title={st.label} count={list.length} schedule={st.schedule} overdue={list.filter((c) => c.days > 7).length}
                  groups={st.subs.map((sb) => ({ label: sb, pass: sb === st.pass, items: list.filter((c) => c.sub === sb).map(card) }))}
                />
              </div>
            );
          })}
        </div>
      )}
      {sel.length > 0 && (
        <div className="jb-bulkbar">
          <b style={{ fontWeight: 600 }}>{sel.length} selected</b>
          <span style={{ flex: 1 }} />
          <Button size="sm" variant="secondary" icon="arrow-right-left" onClick={() => h.onBulk(sel, "move")}>Move stage</Button>
          <Button size="sm" variant="secondary" icon="user">Assign owner</Button>
          <Button size="sm" variant="danger-ghost" icon="x" onClick={() => h.onBulk(sel, "reject", () => setSel([]))}>{user.canDecide ? "Reject" : "Propose rejection"}</Button>
          <Button size="sm" variant="ghost" onClick={() => setSel([])}>Clear</Button>
        </div>
      )}
    </div>
  );
}

export function AttentionTab({ h, items, resolve, admin }: { h: CandHandlers; items: AttentionItem[]; resolve: (id: string) => void; admin?: boolean }) {
  const groups = [...new Set(items.map((a) => a.group))];
  if (!items.length)
    return (
      <div className="jb-empty">
        <Icon name="circle-check" size={20} style={{ color: "var(--success)" }} />
        <b>Nothing needs attention</b>
        <span style={{ color: "var(--muted)" }}>New issues from uploads and scoring appear here.</span>
      </div>
    );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 980 }}>
      <div style={{ fontSize: 13, color: "var(--fg-2)" }}>{items.length} items across uploads, scoring and interviews. Resolved items leave this list; nothing is deleted.</div>
      {groups.map((g) => (
        <section key={g} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="jb-overline">{g} · {items.filter((a) => a.group === g).length}</div>
          <div className="shx-list">
            {items.filter((a) => a.group === g).map((a) =>
              a.fs ? (
                <FileStatusRow
                  key={a.id} file={a.file} status={a.fs as FileStatusKey} detail={a.title + " · " + a.detail} tech={a.tech} admin={admin}
                  actions={[...a.actions.map((x) => ({ label: x, onClick: () => h.onAttention(a, x) })), { label: "Mark resolved", onClick: () => resolve(a.id) }]}
                />
              ) : (
                <div key={a.id} className="shx-file">
                  <div className="shx-row">
                    <Icon name={a.kind === "score" ? "sparkles" : "message-square"} size={14} style={{ color: "var(--muted)" }} />
                    <b style={{ fontWeight: 600 }}>{a.file}</b>
                    <span className="shx-sp" />
                    {a.kind === "score" ? <MatchStatusInline status="error" /> : <Badge tone="warning" icon="clock">Overdue</Badge>}
                  </div>
                  <span className="shx-small">{a.title} · {a.detail}</span>
                  <div className="shx-row" style={{ gap: 4 }}>
                    {a.actions.map((x, j) => <Button key={x} size="sm" variant={j ? "ghost" : "secondary"} onClick={() => h.onAttention(a, x)}>{x}</Button>)}
                    <Button size="sm" variant="ghost" onClick={() => resolve(a.id)}>Mark resolved</Button>
                  </div>
                </div>
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

type CritRow = Criterion & { edited?: boolean; aiStatus?: CritResult | null };
const ZOOMS = ["md", "full"] as const;
type Zoom = (typeof ZOOMS)[number];
const readZoom = (): Zoom => { const z = lsGet<string>("jb-drawer-zoom", "md"); return z === "full" ? "full" : "md"; };

export function CandidateDrawer({ c, user, h, onClose, onRescore, onShare, onSubmitNotes, nav, onOpen, stages = STAGES }: {
  c: Candidate | null; user: Role; h: MoveHandlers; onClose: () => void; nav?: { ids: number[]; label: string } | null; onOpen?: (id: number) => void; onRescore: (c: Candidate) => void; onShare: () => void; onSubmitNotes: (c: Candidate, v: string) => void; stages?: Stage[];
}) {
  const [crit, setCrit] = React.useState<CritRow[]>(() => []);
  const [tab, setTab] = React.useState(user.key === "iv" ? "notes" : "match");
  const [zoom, setZoom] = React.useState<Zoom>(readZoom);
  const setZ = (z: Zoom) => { setZoom(z); lsSet("jb-drawer-zoom", z); };
  React.useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest && t.closest("input,textarea,select,[contenteditable]")) return;
      if (e.key === "Escape") { onClose(); return; }
      if ((e.key === "j" || e.key === "k") && nav && onOpen && c) {
        const i = nav.ids.indexOf(c.id), n = nav.ids[i + (e.key === "j" ? 1 : -1)];
        if (i >= 0 && n != null) onOpen(n);
        return;
      }
      const step = e.key === "+" || e.key === "=" ? 1 : e.key === "-" ? -1 : 0;
      if (!step) return;
      setZoom((cur) => { const z = ZOOMS[Math.max(0, Math.min(1, ZOOMS.indexOf(cur) + step))]; lsSet("jb-drawer-zoom", z); return z; });
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  });
  if (!c) return null;
  const s = stageOf(c.stage, stages);
  const prev = (c.flags || []).includes("prev");
  const hidden = !!user.hideScore && !c.ivDone;
  const tabs = [
    { id: "match", label: "Match" },
    ...(s.schedule ? [{ id: "notes", label: "Interviews & notes", count: c.noNote ? 1 : null, warn: true }] : []),
    { id: "history", label: "Activity" },
  ];
  const idx = nav ? nav.ids.indexOf(c.id) : -1;
  const go = (d: number) => { const n = nav?.ids[idx + d]; if (n != null && onOpen) onOpen(n); };
  const full = zoom === "full";
  return (
    <>
      {!full && <div className="jb-scrim" onClick={onClose} />}
      <div className={full ? "ad-full" : "ad-quick"} role="dialog" aria-label={c.name}>
        <div className="ad-ctx">
          <nav className="ad-crumb" aria-label="Breadcrumb">
            <span>{nav?.label ?? "Candidates"}</span><Icon name="chevron-right" /><b>{c.name}</b>
          </nav>
          <span className="ad-sp" />
          {nav && idx >= 0 && (
            <div className="ad-pager">
              <button type="button" className="sh-iconbtn" aria-label="Previous candidate" disabled={idx <= 0} onClick={() => go(-1)}><Icon name="chevron-up" /></button>
              <span className="ad-pager__n">{idx + 1} / {nav.ids.length}</span>
              <button type="button" className="sh-iconbtn" aria-label="Next candidate" disabled={idx >= nav.ids.length - 1} onClick={() => go(1)}><Icon name="chevron-down" /></button>
            </div>
          )}
          <span className="ad-vr" />
          <button type="button" className="sh-iconbtn" aria-label={full ? "Collapse panel" : "Expand panel"} aria-pressed={full} title={full ? "Collapse (−)" : "Expand (+)"} onClick={() => setZ(full ? "md" : "full")}>
            <Icon name={full ? "minimize-2" : "maximize-2"} />
          </button>
          <button type="button" className="sh-iconbtn" aria-label="Close (Esc)" onClick={onClose}><Icon name="x" /></button>
        </div>
        <header className="ad-head">
          <div className="ad-head__top">
            <div style={{ flex: 1, minWidth: 240 }}>
              <CandidateHeader
                name={c.name} tags={<><Flags c={c} />{prev && <IdentityTag kind="apps" count={3} />}</>}
                meta={c.headline + " · " + c.source + " · added " + c.applied} sync={prev ? "Skills and experience updated from CV v2 · 24/09" : undefined}
              />
            </div>
            {user.key !== "iv" && (
              <div className="ad-acts">
                <MoveButton c={c} h={h} user={user} size="lg" stages={stages} />
                <Button variant="secondary" icon="link" onClick={onShare}>Share evaluation</Button>
              </div>
            )}
          </div>
          <StagePath c={c} stages={stages} />
        </header>
        <div className="ad-body">
          <div className="ad-left"><div className="ad-pane" style={{ overflow: "auto" }}>
            <section className="ad-card"><div className="ad-card__h">Application</div><div className="ad-card__b">
              <dl className="ad-kv">
                <dt>Stage</dt><dd><StageChip stage={c.stage} sub={c.sub} stages={stages} /></dd>
                <dt>Source</dt><dd>{c.source}</dd>
                <dt>Applied</dt><dd>{c.applied}</dd>
                <dt>Days in stage</dt><dd>{c.days}</dd>
                <dt>Expected salary</dt><dd>{user.salary ? c.salary : <RestrictedValue />}</dd>
              </dl>
            </div></section>
            <section className="ad-sec">
              <div className="ad-ov">Applications</div>
              <ApplicationRow
                job={"This position"} date={c.applied} stage={<StageChip stage={c.stage} sub={c.sub} stages={stages} />} band={!hidden && c.st === "done" ? c.band : undefined}
                score={c.score} status={c.stage === "hired" ? "hired" : "open"} salaryRestricted={!user.salary}
              />
              {prev && (
                <>
                  <ApplicationRow job="Talent pool" date="11/2025" note="kept after position closed" status="pool" />
                  <ApplicationRow job="Web Developer #97" date="03/2025" stage="stopped at Interview 2" status="ended" />
                </>
              )}
            </section>
            <section className="ad-sec">
              <div className="ad-ov">CV versions</div>
              {prev ? (
                <>
                  <CVVersionItem version={2} active date="24/09/2026" change="added 1 year at FinPay, added React Native" />
                  <CVVersionItem version={1} date="12/03/2025" />
                </>
              ) : (
                <CVVersionItem version={1} active date={c.applied} />
              )}
            </section>
          </div></div>
          <div className="ad-right">
            <div className="ad-right__tabs"><EntityTabs tabs={tabs} value={tab} onChange={setTab} /></div>
            <div className="ad-pane">
              {tab === "match" &&
                (hidden ? (
                  <HiddenScoreNotice />
                ) : c.st === "error" ? (
                  <Banner tone="danger" title="AI scoring failed" action={<Button size="sm" variant="secondary" icon="rotate-ccw" onClick={() => onRescore(c)}>Rescore</Button>}>
                    {c.err}. Rule checks completed; the AI part is missing so no band is shown.
                  </Banner>
                ) : c.st === "scoring" ? (
                  <Banner tone="info" icon="loader-circle">Reading CV and scoring against 5 criteria. You can keep working; the row updates when done.</Banner>
                ) : (
                  <>
                    <div className="shx-row"><MatchBand band={c.band} score={c.score} /><AIBadge meta={{ Model: "gpt-4.1", Provider: "Azure OpenAI", At: "24/09 14:22" }} /></div>
                    {c.band !== "review" && <ScoreComposition ai={c.ai} rule={c.formula ?? 0} at="24/09 14:22" />}
                    <div className="ad-sec">
                      <div className="ad-ov">By criterion</div>
                      <div className="shx-list">
                        {crit.map((r) => (
                          <CriterionResult
                            key={r.id} name={r.req} importance={r.imp} result={r.status} evidence={r.evidence} src={r.src}
                            edited={r.edited && r.aiStatus ? { by: user.name, reason: "Confirmed in phone screen", ai: r.aiStatus } : null}
                            onOverride={user.canDecide ? (v) => setCrit((cs) => cs.map((x) => (x.id === r.id ? { ...x, aiStatus: x.aiStatus || x.status, status: v, edited: true } : x))) : undefined}
                            onRevert={r.edited ? () => setCrit((cs) => cs.map((x) => (x.id === r.id ? { ...x, status: x.aiStatus || x.status, edited: false, aiStatus: null } : x))) : undefined}
                          />
                        ))}
                      </div>
                    </div>
                    <AIRationale text="Solid frontend experience on payment systems; strong React and TypeScript across two companies. REST integrations are well described, GraphQL is not mentioned. English level is not stated anywhere in the CV, so the language criterion could not be assessed and should be checked in the phone screen." />
                  </>
                ))}
              {tab === "history" && <ActivityTimeline items={[]} />}
              {tab === "notes" && (
                <>
                  {hidden && <HiddenScoreNotice />}
                  <InterviewNoteEditor round={s.label} submitted={c.ivDone} initial={c.ivNote || ""} onSubmit={(v) => onSubmitNotes(c, v)} />
                  <div className="shx-small">Notes are independent: other interviewers&apos; notes appear after you submit yours.</div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
