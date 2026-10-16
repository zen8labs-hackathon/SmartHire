"use client";

import * as React from "react";
import { STAGES, srcInfo, type AttentionItem, type Candidate, type Criterion, type Role, type Stage, type TimelineItem } from "./data";
import { CVSideBySide } from "./cv-view";
import { fetchActivity, fetchApplications, fetchCandidateMatch, fetchCvHistory, fetchInterviewNotes, fetchSchedules, saveInterviewNote, overrideCriterion, revertCriterion, rescoreCandidate, type CandidateApplicationRow, type CandidateMatch, type CandidateSchedule, type InterviewNote, type CvVersionItem as CvVer } from "./api";
import { NextStepPanel, nextStep, stageKind, type Act } from "./nextstep";
import { MoveButton, Pop, StageChip, StagePath, moveItems, stageOf, type MoveHandlers } from "./shell";
import {
  AIBadge, AIRationale, ActivityTimeline, ApplicationRow, Avatar, Badge, Banner, Button, CVVersionItem, CandidateHeader, Checkbox, CriterionResult,
  EntityTabs, FileStatus, FileStatusRow, HiddenScoreNotice, Icon, IdentityTag, Input, InterviewNoteEditor, KanbanCard, KanbanColumn, MatchBand,
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
export type CandPreset = { mine?: boolean; stage?: string[]; band?: string[]; source?: string[]; scoring?: string[]; q?: string };

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
  const P0 = React.useMemo<CandPreset>(() => {
    if (preset) return preset;
    if (typeof window === "undefined") return {};
    const q = new URLSearchParams(window.location.search);
    const L = (k: string) => (q.get(k) || "").split(",").filter(Boolean);
    return { mine: q.get("mine") === "1", stage: L("stage"), band: L("band"), source: L("source"), scoring: L("scoring"), q: q.get("q") || "" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [sel, setSel] = React.useState<number[]>([]);
  const [mineOnly, setMineOnly] = React.useState(!!P0.mine);
  const [fStage, setFStage] = React.useState<string[]>(P0.stage || []);
  const [menuFor, setMenuFor] = React.useState<number | null>(null);
  const [fBand, setFBand] = React.useState<string[]>(P0.band || []);
  const [fSrc, setFSrc] = React.useState<string[]>(P0.source || []);
  const [fScore, setFScore] = React.useState<string[]>(P0.scoring || []);
  const [search, setSearch] = React.useState(P0.q || "");
  React.useEffect(() => {
    const u = new URL(window.location.href);
    const put = (k: string, v: string[]) => (v.length ? u.searchParams.set(k, v.join(",")) : u.searchParams.delete(k));
    put("stage", fStage); put("band", fBand); put("source", fSrc); put("scoring", fScore);
    if (search.trim()) u.searchParams.set("q", search.trim()); else u.searchParams.delete("q");
    if (mineOnly) u.searchParams.set("mine", "1"); else u.searchParams.delete("mine");
    const next = u.pathname + u.search + u.hash;
    if (next !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(window.history.state, "", next);
  }, [fStage, fBand, fSrc, fScore, mineOnly, search]);
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
  const needle = search.trim().toLowerCase();
  const rows = base.filter((c) => pass(c) && (!needle || c.name.toLowerCase().includes(needle)) && (!mineOnly || isMine(c)));
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
    ...(user.key !== "iv" ? [{ key: "act", label: "", sticky: "right", align: "right", render: (c) => <MoveButton c={c} h={h} user={user} label="Move" stages={S} /> } as Column<Candidate>] : []),
  ];
  const canRemove = sel.length > 0 && S.length > 0 && sel.every((id) => cands.find((c) => c.id === id)?.stage === S[0].id);
  const scoring = cands.filter((c) => c.st === "scoring").length;
  const listLabel = active.length ? "Filtered list" : "All candidates";
  const hiddenCol = !user.salary && user.key !== "iv";
  const closeMenu = <A extends unknown[]>(f: (...a: A) => void) => (...a: A) => { setMenuFor(null); f(...a); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: sel.length ? 80 : 0 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Input icon="search" size="sm" placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 220 }} />
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
          <Button size="sm" variant="secondary" icon="arrow-right-left" onClick={() => h.onBulk(sel, "move", () => setSel([]))}>Move stage</Button>
          {canRemove && <Button size="sm" variant="danger" icon="user-minus" onClick={() => h.onBulk(sel, "remove", () => setSel([]))}>Remove</Button>}
          <Button size="sm" variant="ghost" className="jb-bulkbar-clear" onClick={() => setSel([])}>Clear</Button>
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
const ddmm = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
const readZoom = (): Zoom => { const z = lsGet<string>("jb-drawer-zoom", "md"); return z === "full" ? "full" : "md"; };

export function CandidateDrawer({ c, user, h, onClose, onRescore, onShare, onSubmitNotes, nav, onOpen, stages = STAGES }: {
  c: Candidate | null; user: Role; h: MoveHandlers; onClose: () => void; nav?: { ids: number[]; label: string } | null; onOpen?: (id: number) => void; onRescore: (c: Candidate) => void; onShare: () => void; onSubmitNotes: (c: Candidate, v: string) => void; stages?: Stage[];
}) {
  const [tab, setTab] = React.useState(user.key === "iv" ? "notes" : "match");
  const [match, setMatch] = React.useState<CandidateMatch | null>(null);
  const [matchErr, setMatchErr] = React.useState<string | null>(null);
  const [apps, setApps] = React.useState<CandidateApplicationRow[] | null>(null);
  const [cvVers, setCvVers] = React.useState<CvVer[] | null>(null);
  const [acts, setActs] = React.useState<{ items: TimelineItem[]; next: string | null } | null>(null);
  const [actErr, setActErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [scheds, setScheds] = React.useState<CandidateSchedule[] | null>(null);
  const [notes, setNotes] = React.useState<InterviewNote[] | null>(null);
  const [notesErr, setNotesErr] = React.useState<string | null>(null);
  const [addNote, setAddNote] = React.useState(false);
  const [quote, setQuote] = React.useState<{ text: string; n: number } | null>(null);
  const [personOpen, setPersonOpen] = React.useState(true);
  const [allApps, setAllApps] = React.useState(false);
  const caId = c?.caId;
  const loadMatch = React.useCallback((signal?: AbortSignal) => {
    if (!caId) return Promise.resolve();
    return fetchCandidateMatch(caId, signal).then((m) => { setMatch(m); setMatchErr(null); }).catch((e) => { if (!signal?.aborted) setMatchErr(e instanceof Error ? e.message : "Could not load the match."); });
  }, [caId]);
  React.useEffect(() => {
    if (!caId) return;
    const ac = new AbortController();
    fetchApplications(caId, ac.signal).then(setApps).catch(() => setApps([]));
    fetchCvHistory(caId, ac.signal).then(setCvVers).catch(() => setCvVers([]));
    return () => ac.abort();
  }, [caId]);
  React.useEffect(() => {
    if (!caId || tab !== "match" || (c && c.st !== "done")) return;
    const ac = new AbortController();
    void loadMatch(ac.signal);
    return () => ac.abort();
  }, [caId, tab, c?.st, c?.score, loadMatch]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!caId || tab !== "history") return;
    const ac = new AbortController();
    setActErr(null);
    fetchActivity(caId, null, ac.signal).then((r) => setActs({ items: r.items, next: r.nextCursor })).catch((e) => { if (!ac.signal.aborted) setActErr(e instanceof Error ? e.message : "Could not load activity."); });
    return () => ac.abort();
  }, [caId, tab]);
  React.useEffect(() => {
    if (!caId || tab !== "notes") return;
    const ac = new AbortController();
    setNotesErr(null);
    fetchSchedules(caId, ac.signal).then(setScheds).catch(() => setScheds([]));
    fetchInterviewNotes(caId, ac.signal).then(setNotes).catch((e) => { if (!ac.signal.aborted) { setNotes([]); setNotesErr(e instanceof Error ? e.message : "Could not load notes."); } });
    return () => ac.abort();
  }, [caId, tab]);
  const submitNote = async (v: string) => {
    if (!c) return;
    if (caId) {
      try { const n = await saveInterviewNote(caId, v); setNotes((p) => [n, ...(p ?? [])]); setNotesErr(null); } catch (e) { setNotesErr(e instanceof Error ? e.message : "Could not save the note."); return; }
    }
    setAddNote(false);
    onSubmitNotes(c, v);
  };
  const crit: CritRow[] = (match?.criteria ?? []).map((r) => ({
    id: r.id, req: r.req, imp: r.imp, origin: r.origin === "HR" ? "HR" : "AI", status: r.status, evidence: r.evidence,
    edited: !!r.override, aiStatus: r.override?.original ?? null,
  }));
  const reasonOf = (id: string) => match?.criteria.find((x) => x.id === id)?.override?.reason ?? null;
  const VERDICT = { meets: "met", partial: "partial", not_met: "missing", unknown: "unclear" } as const;
  const [pendingOv, setPendingOv] = React.useState<{ id: string; v: CritResult } | null>(null);
  const [ovReason, setOvReason] = React.useState("");
  const doOverride = async (id: string, v: CritResult, reason: string) => {
    if (!caId) return;
    setPendingOv(null); setOvReason("");
    setBusy(id);
    try { await overrideCriterion(caId, id, VERDICT[v], reason.trim() || null); await loadMatch(); } catch (e) { setMatchErr(e instanceof Error ? e.message : "Could not save the override."); } finally { setBusy(null); }
  };
  const doRevert = async (id: string) => {
    if (!caId) return;
    setBusy(id);
    try { await revertCriterion(caId, id); await loadMatch(); } catch (e) { setMatchErr(e instanceof Error ? e.message : "Could not revert."); } finally { setBusy(null); }
  };
  const doRescore = async () => {
    if (!c) return;
    if (caId) { try { await rescoreCandidate(caId); } catch (e) { setMatchErr(e instanceof Error ? e.message : "Could not rescore."); return; } }
    onRescore(c);
  };
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
  const kind = stageKind(s, stages.indexOf(s));
  const ns = nextStep(c, user, stages, { mustHaves: crit.length ? { met: crit.filter((x) => x.status === "meets").length, total: crit.length } : null });
  const runAct = (a: Act) => {
    if (a.t === "rescore") return void doRescore();
    if (a.t === "interview") return setTab("notes");
    if (a.t === "fail" || a.t === "decline") return h.onReject(c);
    if (a.sub && !a.to) return h.onSub(c, a.sub);
    if (a.to) return h.onMove(c, a.to);
  };
  const tabs = [
    { id: "match", label: "Match" },
    ...(kind === "offer" ? [{ id: "offer", label: "Offer" }] : []),
    ...(kind === "prob" ? [{ id: "probation", label: "Probation" }] : []),
    { id: "notes", label: "Interviews & notes", count: c.noNote ? 1 : null, warn: true },
    { id: "history", label: "Activity" },
  ];
  const idx = nav ? nav.ids.indexOf(c.id) : -1;
  const go = (d: number) => { const n = nav?.ids[idx + d]; if (n != null && onOpen) onOpen(n); };
  const [jumpOpen, setJumpOpen] = React.useState(false);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
      if (e.key === "j") go(1); else if (e.key === "k") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
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
              <Button variant="ghost" size="sm" icon="chevron-left" disabled={idx <= 0} onClick={() => go(-1)} title={idx <= 0 ? "This is the first application in this group" : "Previous (K)"}>Previous</Button>
              <button type="button" className="ad-pager__n" aria-haspopup="menu" aria-expanded={jumpOpen} title="Jump to…" onClick={() => setJumpOpen((v) => !v)}>{idx + 1} / {nav.ids.length}</button>
              <Button variant="ghost" size="sm" iconRight="chevron-right" disabled={idx >= nav.ids.length - 1} onClick={() => go(1)} title={idx >= nav.ids.length - 1 ? "This is the last application in this group" : "Next (J)"}>Next</Button>
              {jumpOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 4 }} onClick={() => setJumpOpen(false)} />
                  <div className="ad-pop ad-pop--down ad-menu" role="menu" style={{ padding: 4, width: 200, maxHeight: 320, overflow: "auto" }}>
                    {nav.ids.map((id, i) => (
                      <button key={id} type="button" role="menuitemradio" aria-checked={i === idx} onClick={() => { setJumpOpen(false); if (id !== c.id && onOpen) onOpen(id); }}>
                        <span style={{ color: "var(--muted)", width: 24 }}>{i + 1}</span>
                        <span>{i === idx ? c.name : `Application ${i + 1}`}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <span className="ad-pager__scope" style={{ cursor: "default" }}>in <em>{nav.label}</em></span>
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
          <NextStepPanel ns={ns} render={(a) => (
            <Button key={a.t + a.label} size="sm" variant={a.primary ? "primary" : "secondary"} icon={a.icon} onClick={() => runAct(a)}>{a.label}</Button>
          )} />
        </header>
        <div className="ad-body">
          <div className="ad-left">
            <CVSideBySide c={c} user={user} onRescore={() => onRescore(c)} onQuote={(t) => { setTab("notes"); setAddNote(true); setQuote({ text: t, n: Date.now() }); }} />
          </div>
          <div className="ad-right">
            <div className="ad-right__tabs"><EntityTabs tabs={tabs} value={tab} onChange={setTab} /></div>
            <div className="ad-pane">
              {tab === "match" &&
                (hidden ? (
                  <HiddenScoreNotice />
                ) : c.st === "error" ? (
                  <Banner tone="danger" title="AI scoring failed" action={<Button size="sm" variant="secondary" icon="rotate-ccw" onClick={() => void doRescore()}>Rescore</Button>}>
                    {c.err}. Rule checks completed; the AI part is missing so no band is shown.
                  </Banner>
                ) : c.st === "scoring" ? (
                  <Banner tone="info" icon="loader-circle">Reading CV and scoring against the job criteria. You can keep working; the row updates when done.</Banner>
                ) : (
                  <>
                    <div className="shx-row"><MatchBand band={c.band} score={c.score} />{match?.composition && <AIBadge meta={{ ...(match.composition.model ? { Model: match.composition.model } : {}), ...(match.composition.provider ? { Provider: match.composition.provider } : {}) }} />}</div>
                    {c.band !== "review" && <ScoreComposition ai={match?.composition?.ai ?? c.ai} aiWeight={match?.composition?.aiWeight} rule={match?.composition?.formula ?? c.formula ?? 0} model={match?.composition?.model} provider={match?.composition?.provider} />}
                    {matchErr && <Banner tone="danger" title="Match unavailable">{matchErr}</Banner>}
                    {match?.stale && <Banner tone="info" title="Criteria changed since the last score">Rescore to apply the updated criteria.</Banner>}
                    <div className="ad-sec">
                      <div className="ad-ov">By criterion</div>
                      {!match && !matchErr && <div className="shx-small">Loading…</div>}
                      {pendingOv && (
                        <div className="shx-note">
                          <label className="sh-field__label" htmlFor="ovreason">Reason for changing “{crit.find((x) => x.id === pendingOv.id)?.req}” (optional)</label>
                          <textarea id="ovreason" autoFocus value={ovReason} onChange={(e) => setOvReason(e.target.value)} placeholder="Why does the AI result need changing?" />
                          <div className="shx-row"><span className="shx-sp" />
                            <Button size="sm" variant="secondary" onClick={() => setPendingOv(null)}>Cancel</Button>
                            <Button size="sm" onClick={() => void doOverride(pendingOv.id, pendingOv.v, ovReason)}>Save change</Button>
                          </div>
                        </div>
                      )}
                      <div className="shx-list">
                        {crit.map((r) => (
                          <CriterionResult
                            key={r.id} name={r.req} importance={r.imp} result={r.status} evidence={r.evidence} src={r.src}
                            edited={r.edited && r.aiStatus ? { by: user.name, reason: reasonOf(r.id) ?? "", ai: r.aiStatus } : null}
                            onOverride={user.canDecide && busy !== r.id ? (v) => { if (v !== r.status) { setPendingOv({ id: r.id, v }); setOvReason(""); } } : undefined}
                            onRevert={r.edited && busy !== r.id ? () => void doRevert(r.id) : undefined}
                          />
                        ))}
                      </div>
                    </div>
                    {match?.summary && <AIRationale text={match.summary} model={match.composition?.model} provider={match.composition?.provider} />}
                  </>
                ))}
              {tab === "history" && (
                actErr ? <Banner tone="danger" title="Activity unavailable">{actErr}</Banner>
                : !acts ? <div className="shx-small">Loading…</div>
                : <>
                    {acts.items.length === 0 ? <div className="shx-small">No activity recorded yet.</div> : <ActivityTimeline items={acts.items} />}
                    {acts.next && caId && <Button size="sm" variant="secondary" onClick={() => { const cur = acts.next; void fetchActivity(caId, cur).then((r) => setActs((p) => ({ items: [...(p?.items ?? []), ...r.items], next: r.nextCursor }))).catch((e) => setActErr(e instanceof Error ? e.message : "Could not load more.")); }}>Load more</Button>}
                  </>
              )}
              {tab === "offer" && (
                <section className="ad-card"><div className="ad-card__h">Offer</div><div className="ad-card__b">
                  <dl className="ad-kv">
                    <dt>Status</dt><dd>{c.sub}</dd>
                    <dt>Expected salary</dt><dd>{user.salary ? c.salary : <RestrictedValue />}</dd>
                    <dt>Owner</dt><dd>{c.owner}</dd>
                    <dt>Days in stage</dt><dd>{c.days}</dd>
                  </dl>
                  <div className="shx-small">Offer details are not available from the API yet.</div>
                </div></section>
              )}
              {tab === "probation" && (
                <section className="ad-card"><div className="ad-card__h">Probation</div><div className="ad-card__b">
                  <dl className="ad-kv">
                    <dt>Status</dt><dd>{c.sub}</dd>
                    <dt>Owner</dt><dd>{c.owner}</dd>
                    <dt>Days in stage</dt><dd>{c.days}</dd>
                  </dl>
                  <div className="shx-small">Probation plan, timeline and mentor review are not available from the API yet.</div>
                </div></section>
              )}
              {tab === "notes" && (
                <>
                  {hidden && <HiddenScoreNotice />}
                  <section className="ad-card">
                    <div className="ad-card__h">Interviews</div>
                    <div className="ad-card__b">
                      {scheds == null ? <div className="shx-small">Loading…</div> : scheds.length === 0 ? <div className="shx-small">No interviews scheduled.</div> : scheds.map((sc) => {
                        const at = new Date(String(sc.scheduled_at ?? "")); const ok = !Number.isNaN(at.getTime());
                        const end = ok ? new Date(at.getTime() + Number(sc.duration_minutes ?? 0) * 60000) : null;
                        const hm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                        return (
                          <div key={String(sc.id)} className="ad-papp">
                            <b>{String(sc.round_label ?? "Interview")}{ok && end ? ` · ${hm(at)}–${hm(end)}` : ""}</b>
                            <span className="shx-small">{String(sc.status ?? "")}</span>
                            <small>{[ok ? ddmm(at.toISOString()) : "", sc.location ? String(sc.location) : ""].filter(Boolean).join(" · ")}</small>
                            {sc.interviewers.length > 0 && <small>Interviewers: {sc.interviewers.join(", ")}</small>}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                  <section className="ad-sec">
                    <div className="shx-row" style={{ justifyContent: "space-between" }}>
                      <div className="ad-ov">Notes &amp; evaluations</div>
                      {!addNote && <Button size="sm" variant="ghost" icon="plus" onClick={() => setAddNote(true)}>Add note</Button>}
                    </div>
                    {notesErr && <Banner tone="danger" title="Notes">{notesErr}</Banner>}
                    {addNote && <InterviewNoteEditor round={s.label} submitted={c.ivDone} initial={c.ivNote || ""} onSubmit={(v) => void submitNote(v)} quote={quote} />}
                    {notes == null ? <div className="shx-small">Loading…</div> : notes.length === 0 && !addNote ? <div className="shx-small">No notes yet.</div> : notes.map((n) => (
                      <div key={n.id} className="ad-note">
                        <header><b>{n.author_username ?? "Unknown"}</b><span>{ddmm(n.created_at)}</span></header>
                        <div style={{ whiteSpace: "pre-wrap" }}>{n.body}</div>
                      </div>
                    ))}
                    <div className="shx-small">Notes are independent: other interviewers&apos; notes appear after you submit yours.</div>
                  </section>
                  <section className="ad-card">
                    <button type="button" className="ad-card__h" style={{ width: "100%", textAlign: "left", display: "flex", justifyContent: "space-between" }} aria-expanded={personOpen} onClick={() => setPersonOpen((o) => !o)}>
                      <span>Person</span><Icon name={personOpen ? "chevron-up" : "chevron-down"} />
                    </button>
                    {personOpen && (
                      <div className="ad-card__b">
                        <dl className="ad-kv">
                          <dt>Stage</dt><dd><StageChip stage={c.stage} sub={c.sub} stages={stages} /></dd>
                          <dt>Source</dt><dd>{c.source}</dd>
                          <dt>Applied</dt><dd>{c.applied}</dd>
                          <dt>Days in stage</dt><dd>{c.days}</dd>
                          <dt>Expected salary</dt><dd>{user.salary ? c.salary : <RestrictedValue />}</dd>
                        </dl>
                        {user.key !== "iv" && (
                          <div className="ad-hist">
                            <div className="ad-ov">History with Zen8labs</div>
                            <div className="ad-ov">Previous applications · {apps?.length ?? 0}</div>
                            {apps == null ? <div className="shx-small">Loading…</div> : (allApps ? apps : apps.slice(0, 3)).map((ap) => (
                              <div key={ap.id} className="ad-papp"><b>{ap.jobTitle}</b><span className="shx-small">{ddmm(ap.appliedAt)}</span></div>
                            ))}
                            {apps != null && apps.length > 3 && <button type="button" className="ad-link" onClick={() => setAllApps((o) => !o)}>{allApps ? "Show fewer" : `View all ${apps.length}`}</button>}
                            <div className="shx-small">History never auto-rejects, blocks or lowers the AI score. Interview notes from earlier applications stay on those applications.</div>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
