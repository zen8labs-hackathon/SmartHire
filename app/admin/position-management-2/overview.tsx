"use client";

import * as React from "react";
import { STAGES, srcInfo, type AttentionItem, type Batch, type BatchFile, type Candidate, type Job, type Role, type Stage } from "./data";
import { AttentionTab, FilterSelect, type CandHandlers, type CandPreset } from "./candidates";
import { Badge, Button, Icon, Tabs } from "./ext";

type Style = React.CSSProperties;

const BAND_L = { strong: "Strong match", good: "Good match", partial: "Partial", limited: "Limited", review: "Needs manual review" } as const;
const BAND_C: Record<keyof typeof BAND_L, string> = {
  strong: "var(--green-700)", good: "var(--z8-green-500, #2E8B57)", partial: "var(--z8-green-300, #7FC29B)", limited: "var(--z8-green-100, #D6EDDE)", review: "var(--neutral-300, #C5CEC9)",
};

function Card({ title, right, children, span, note, top }: { title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; span?: number; note?: React.ReactNode; top?: boolean }) {
  return (
    <section className={"ov-card" + (top ? " ov-card--top" : "")} style={span ? { gridColumn: "span " + span } : undefined}>
      <header className="ov-card__h"><h3>{title}</h3><span className="ad-sp" />{right}</header>
      <div className="ov-card__b">{children}</div>
      {note && <footer className="ov-card__f">{note}</footer>}
    </section>
  );
}

function Bar({ label, v, max, color, onClick }: { label: React.ReactNode; v: number; max: number; color?: string; onClick?: () => void }) {
  return (
    <button type="button" className="ov-bar" onClick={onClick} disabled={!onClick}>
      <span className="ov-bar__l">{label}</span>
      <span className="ov-bar__t"><i style={{ width: (max ? Math.max(v ? 3 : 0, (v / max) * 100) : 0) + "%", background: color || "var(--green-700)" }} /></span>
      <span className="ov-bar__v sh-num">{v}</span>
    </button>
  );
}

type Alert = { tone: "warn" | "info"; icon: string; text: React.ReactNode; go: () => void };

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + "%" : "—");

/** Outcome of a candidate's current sub-stage within its stage. */
function outcome(s: Stage, sub: string): "passed" | "notpass" | "withdrawn" | "active" {
  if (sub === s.pass) return "passed";
  if (s.withdraw?.includes(sub)) return "withdrawn";
  if (s.notPass ? s.notPass.includes(sub) : sub === s.fail) return "notpass";
  return "active";
}

export function OverviewTab({ job, cands, att, stages = STAGES, bs = [], onFilter, onTab }: {
  job: Job; cands: Candidate[]; att: AttentionItem[]; stages?: Stage[]; bs?: Batch[]; user?: Role; onFilter: (p: CandPreset) => void; onTab: (tab: string, sub?: string) => void;
}) {
  const S = stages;
  const [allAlerts, setAllAlerts] = React.useState(false);
  const idx = (c: Candidate) => S.findIndex((s) => s.id === c.stage);
  const keysOf = (s: Stage, subs: string[] = s.subs) => subs.map((x) => s.id + ":" + x);

  const stats = S.map((s, i) => {
    const here = cands.filter((c) => c.stage === s.id);
    const by = { passed: 0, notpass: 0, withdrawn: 0, active: 0 };
    here.forEach((c) => by[outcome(s, c.sub)]++);
    const active = here.filter((c) => outcome(s, c.sub) === "active");
    return { s, i, n: here.length, ...by, over: s.sla ? active.filter((c) => c.days > s.sla!) : [] };
  });
  const lastI = S.length - 1;
  const probI = S.findIndex((s) => s.probation);
  const offerI = Math.max(0, (probI > 0 ? probI : lastI) - 1);
  const offerS = S[offerI];

  const open = Math.max(0, job.headcount - job.hired);
  const atOffer = stats[offerI] ? stats[offerI].n - stats[offerI].notpass - stats[offerI].withdrawn : 0;
  // Candidates still in play at Offer or later (not dropped out there).
  const late = cands.filter((c) => idx(c) >= offerI && idx(c) < lastI && outcome(S[idx(c)], c.sub) !== "notpass" && outcome(S[idx(c)], c.sub) !== "withdrawn").length;

  const first = stats[0];
  const stale = first ? cands.filter((c) => c.stage === first.s.id && outcome(first.s, c.sub) === "active" && c.days > 7) : [];
  const overSla = stats.flatMap((x) => x.over);
  const scoreErr = cands.filter((c) => c.st === "error");
  const activeKeys = (s: Stage) => keysOf(s, s.subs.filter((x) => outcome(s, x) === "active"));
  const alerts = ([
    job.daysLeft != null && open > 0 && offerS && { tone: job.daysLeft <= 14 ? "warn" : "info", icon: "calendar-clock", text: <>Deadline in <b>{job.daysLeft} days</b> · {open} of {job.headcount} still open · {atOffer} at {offerS.label}</>, go: () => onFilter({ stage: keysOf(offerS) }) },
    stale.length > 0 && { tone: "warn", icon: "clock", text: <><b>{stale.length}</b> in {first.s.label} for more than 7 days</>, go: () => onFilter({ stage: activeKeys(first.s) }) },
    overSla.length > 0 && { tone: "warn", icon: "timer", text: <><b>{overSla.length}</b> past the stage SLA without a decision</>, go: () => onFilter({ stage: stats.filter((x) => x.over.length).flatMap((x) => activeKeys(x.s)) }) },
    scoreErr.length > 0 && { tone: "warn", icon: "sparkles", text: <><b>{scoreErr.length}</b> CV with AI scoring failed</>, go: () => onFilter({ scoring: ["error"] }) },
    att.length > 0 && { tone: "info", icon: "file-warning", text: <><b>{att.length}</b> upload and processing items need attention</>, go: () => onTab("uploads") },
  ] as (Alert | false | undefined)[]).filter((a): a is Alert => !!a);
  const risk = open > 0 && job.daysLeft != null && job.daysLeft <= 14 && late < open;
  const dlTone = job.daysLeft == null || !open ? "ok" : job.daysLeft < 0 || risk ? "risk" : job.daysLeft <= 14 ? "warn" : "ok";

  const bands = (Object.keys(BAND_L) as (keyof typeof BAND_L)[]).map((b) => [b, cands.filter((c) => c.st === "done" && c.band === b).length] as const);
  const unscored: [string, number, string][] = [["Scoring", cands.filter((c) => c.st === "scoring").length, "scoring"], ["Scoring failed", scoreErr.length, "error"]];
  const maxB = Math.max(1, ...bands.map((b) => b[1]));

  // Source quality: received → passed the first stage.
  const srcs = [...new Set(cands.map((c) => c.source))]
    .map((src) => {
      const l = cands.filter((c) => c.source === src);
      return { src, n: l.length, p: l.filter((c) => idx(c) > 0 || (first && c.stage === first.s.id && c.sub === first.s.pass)).length };
    })
    .sort((a, b) => b.n - a.n);
  const maxS = Math.max(1, ...srcs.map((s) => s.n));

  const weeks: [string, number][] = Array.from({ length: 6 }, (_, w) => [w ? w + "w ago" : "This wk", bs.filter((b) => Math.floor(b.ago / 7) === w).reduce((a, b) => a + b.files.length, 0)] as [string, number]).reverse();
  const maxW = Math.max(1, ...weeks.map((w) => w[1]));
  const kinds = (k: BatchFile["kind"]) => bs.reduce((a, b) => a + b.files.filter((f) => f.kind === k).length, 0);

  return (
    <div className="ov-grid">
      <Card title="Hiring progress" span={4} right={job.daysLeft != null && (
        <span className={"hc-dl is-" + dlTone} title={(dlTone === "risk" ? "At risk" : dlTone === "warn" ? "Deadline close" : "On track") + " · Deadline " + job.deadline}>
          <Icon name={dlTone === "ok" ? "calendar-check" : dlTone === "warn" ? "calendar-clock" : "triangle-alert"} size={14} />
          <b className="sh-num">{job.daysLeft < 0 ? -job.daysLeft + " days overdue" : job.daysLeft + " days left"}</b>
        </span>
      )}>
        {cands.length ? <StageColumns S={S} cands={cands} idx={idx} keysOf={keysOf} onFilter={onFilter} /> : (
          <div className="hc-empty"><Icon name="file-up" size={20} /><span>No CVs in this position yet.</span><Button size="sm" icon="upload" onClick={() => onTab("uploads")}>Upload CVs</Button></div>
        )}
        <div className="pf__hc">
          <span>Positions</span>
          <div className="ov-prog">{Array.from({ length: job.headcount }).map((_, i) => <i key={i} className={i < job.hired ? "is-on" : ""} title={i < job.hired ? "Filled" : "Open"} />)}</div>
          <span className="sh-num"><b>{job.hired}</b> filled · <b>{open}</b> open</span>
        </div>
      </Card>
      <Card title="CV sources" span={2} note={"Passed = cleared " + (first?.s.label || "the first stage") + " or later"}>
        {srcs.map(({ src, n, p }) => {
          const [cls, ic] = srcInfo(src);
          return (
            <button type="button" key={src} className="ov-src" onClick={() => onFilter({ source: [src] })} title={src + ": " + p + " of " + n + " passed (" + pct(p, n) + ")"}>
              <span className={"src-chip src--" + cls}><Icon name={ic} size={12} />{src}</span>
              <span className="ov-bar__t">
                <i style={{ width: (n / maxS) * 100 + "%", background: "var(--z8-green-200, #ADDABD)" }} />
                <i style={{ width: (p / maxS) * 100 + "%", background: "var(--green-700)", position: "absolute", left: 0, top: 0 }} />
              </span>
              <span className="sh-num ov-src__v">{p} / {n}</span>
            </button>
          );
        })}
        <div className="ov-legend"><span><i style={{ background: "var(--z8-green-200, #ADDABD)" }} />Received</span><span><i style={{ background: "var(--green-700)" }} />Passed</span></div>
      </Card>
      <Card title="Match bands" span={2} right={<span className="shx-small">One signal, not a ranking</span>}>
        {bands.map(([b, k]) => <Bar key={b} label={BAND_L[b]} v={k} max={maxB} color={BAND_C[b]} onClick={k ? () => onFilter({ band: [b] }) : undefined} />)}
        <div className="ov-mini">
          {unscored.map(([l, k, key]) => <button type="button" key={key} className="ov-subchip" disabled={!k} onClick={() => onFilter({ scoring: [key] })}>{l} <b className="sh-num">{k}</b></button>)}
        </div>
      </Card>
      <Card title="Needs your eye" span={2} top right={<span className="shx-small sh-num">{alerts.length}</span>}>
        {alerts.length ? (
          <div className="ov-alerts">
            {(allAlerts ? alerts : alerts.slice(0, 3)).map((a, i) => (
              <button type="button" key={i} className={"ov-alert ov-alert--" + a.tone} onClick={a.go}><Icon name={a.icon} size={16} /><span>{a.text}</span><Icon name="chevron-right" size={14} /></button>
            ))}
            {alerts.length > 3 && <Button size="sm" variant="ghost" onClick={() => setAllAlerts(!allAlerts)}>{allAlerts ? "Show less" : "Show all " + alerts.length}</Button>}
          </div>
        ) : <span className="shx-small">Nothing stuck right now.</span>}
      </Card>
      <Card title="Upload activity" span={2} top right={<Button size="sm" variant="ghost" iconRight="arrow-right" onClick={() => onTab("uploads", "history")}>Upload history</Button>} note="CV files uploaded per week, last 6 weeks">
        <div className="ov-weeks">{weeks.map(([w, n]) => <div key={w} className="ov-week"><span className="sh-num">{n}</span><i style={{ height: (n / maxW) * 64 + "px" }} /><small>{w}</small></div>)}</div>
        <div className="ov-mini">
          <span className="ov-subchip">New candidates <b className="sh-num">{kinds("new")}</b></span>
          <span className="ov-subchip">Existing <b className="sh-num">{kinds("existing") + kinds("dup_job") + kinds("same_file") + kinds("suspected")}</b></span>
          <span className="ov-subchip">Failed <b className="sh-num">{kinds("failed")}</b></span>
        </div>
      </Card>
    </div>
  );
}

const HPC = { now: "var(--z8-green-700, #1F6B43)", out: "var(--neutral-300, #C5CEC9)" };
/** Round up to 1/2/5 × 10^k. */
const nice = (v: number) => {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, v))));
  return ([1, 2, 5, 10].find((m) => m * p >= v) || 10) * p;
};

/** Stage columns: candidates currently at each stage, split into still in play / dropped out. */
function StageColumns({ S, cands, idx, keysOf, onFilter }: {
  S: Stage[]; cands: Candidate[]; idx: (c: Candidate) => number; keysOf: (s: Stage, subs?: string[]) => string[]; onFilter: (p: CandPreset) => void;
}) {
  const [tip, setTip] = React.useState<number | null>(null);
  const reached = S.map((_, i) => cands.filter((c) => idx(c) >= i).length);
  // Step rate counts only decided candidates at the previous stage: passed (moved on, or marked passed there) vs dropped out.
  const step = S.map((s, i) => {
    const here = cands.filter((c) => c.stage === s.id).map((c) => outcome(s, c.sub));
    const passed = (reached[i + 1] || 0) + here.filter((o) => o === "passed").length;
    return { passed, decided: passed + here.filter((o) => o === "notpass" || o === "withdrawn").length };
  });
  const cols = S.map((s, i) => {
    const here = cands.filter((c) => c.stage === s.id);
    const isOut = (sub: string) => { const o = outcome(s, sub); return o === "notpass" || o === "withdrawn"; };
    const out = here.filter((c) => isOut(c.sub)).length;
    const inSubs = s.subs.filter((x) => !isOut(x));
    const outSubs = s.subs.filter(isOut);
    const now = here.length - out;
    return {
      s, i, total: here.length, now, out,
      prev: i ? step[i - 1] : null,
      conv: i ? (step[i - 1].decided ? Math.round((step[i - 1].passed / step[i - 1].decided) * 100) : null) : null,
      segs: [
        ["now", "In this stage now", now, keysOf(s, inSubs)],
        ["out", "Failed or rejected", out, keysOf(s, outSubs)],
      ] as [keyof typeof HPC, string, number, string[]][],
    };
  });
  const yMax = nice(Math.max(1, ...cols.map((c) => c.total)) * 1.12);
  const grid: Style = { gridTemplateColumns: `repeat(${S.length},minmax(0,1fr))` };
  return (
    <div className="hpc">
      <div className="hpc__legend">
        <span><i style={{ background: HPC.now }} />In this stage now</span>
        <span><i style={{ background: HPC.out }} />Failed or rejected</span>
      </div>
      <div className="hpc__chart">
        <div className="hpc__y">{[0, 25, 50, 75, 100].map((t) => <span key={t} className="sh-num" style={{ bottom: t + "%" }}>{Math.round((yMax * t) / 100)}</span>)}</div>
        <div className="hpc__plot">
          {[25, 50, 75, 100].map((t) => <div key={t} className="hpc__grid" style={{ bottom: t + "%" }} />)}
          <div className="hpc__cols" style={grid}>
            {cols.map(({ s, i, total, conv, prev, segs }) => (
              <div key={s.id} className="hpc__col" onMouseEnter={() => setTip(i)} onMouseLeave={() => setTip(null)}>
                <div className="hpc__bar" style={{ height: (total / yMax) * 100 + "%" }}>
                  {segs.map(([k, l, v, keys]) => v > 0 && (
                    <button type="button" key={k} aria-label={s.label + " · " + l + ": " + v} style={{ height: (v / total) * 100 + "%", background: HPC[k] }} onClick={() => onFilter({ stage: keys })} />
                  ))}
                  <em className="sh-num">{total}</em>
                </div>
                {tip === i && (
                  <div className="hpc__tip" style={i < S.length / 2 ? { left: "calc(50% + 24px)" } : { right: "calc(50% + 24px)" }}>
                    <b>{s.label} · {total} in this stage</b>
                    {segs.map(([k, l, v]) => <div key={k}><i style={{ background: HPC[k] }} />{l}<span className="sh-num">{v}</span></div>)}
                    {prev && <p>{conv != null ? conv + "% · " : ""}{prev.passed} of {prev.decided} decided at {S[i - 1].label} passed</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="hpc__x" style={grid}>
          {cols.map(({ s, conv }) => (
            <div key={s.id} className="hpc__xc">
              {conv != null && <span className="hpc__conv sh-num"><Icon name="arrow-right" size={10} />{conv}%</span>}
              <button type="button" className="hpc__lab" style={{ "--stc": s.color } as Style} onClick={() => onFilter({ stage: keysOf(s) })}><i />{s.label}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const KIND: Record<BatchFile["kind"], [string, string, string]> = {
  new: ["success", "user-plus", "New candidate"], existing: ["info", "history", "Existing candidate"], dup_job: ["warning", "copy", "Already in this position"],
  same_file: ["warning", "file-check", "Same file"], suspected: ["warning", "users", "Possible duplicate"], failed: ["danger", "file-x", "Failed"],
  processing: ["info", "loader", "Processing"],
};
const KIND_KEYS = Object.keys(KIND) as BatchFile["kind"][];

export function UploadsTab({ h, att, resolve, admin, view, setView, onOpenCand, bs, histErr }: {
  bs: Batch[]; histErr?: string | null; h: CandHandlers; att: AttentionItem[]; resolve: (id: string) => void; admin?: boolean; view: string; setView: (v: string) => void; isPool?: boolean;
  onOpenCand: (f: BatchFile, tab?: string) => void;
}) {
  const [fKind, setFKind] = React.useState<string[]>([]);
  const [fBy, setFBy] = React.useState<string[]>([]);
  const [fSrc, setFSrc] = React.useState<string[]>([]);
  const [range, setRange] = React.useState("all");
  const [openB, setOpenB] = React.useState<string[]>(() => (bs[0] ? [bs[0].id] : []));
  const inRange = (b: Batch) => range === "all" || (range === "7" ? b.ago <= 7 : b.ago <= 30);
  const fileOk = (f: BatchFile) => !fKind.length || fKind.includes(f.kind);
  const list = bs.filter((b) => inRange(b) && (!fBy.length || fBy.includes(b.by)) && (!fSrc.length || fSrc.includes(b.source)) && b.files.some(fileOk));
  const cnt = (b: Batch, k: string) => b.files.filter((f) => f.kind === k).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="shx-row" style={{ gap: 8, flexWrap: "wrap" }}>
        <Tabs variant="segmented" value={view} onChange={setView} tabs={[{ id: "attention", label: "Needs attention" + (att.length ? " · " + att.length : "") }, { id: "history", label: "Upload history" }]} />
        {view === "history" && (
          <>
            <span style={{ width: 1, height: 20, background: "var(--border)" }} />
            <FilterSelect label="Result" options={KIND_KEYS.map((k) => [k, KIND[k][2]])} value={fKind} onChange={setFKind} count={(k) => bs.reduce((a, b) => a + cnt(b, k), 0)} />
            <FilterSelect label="Uploaded by" options={[...new Set(bs.map((b) => b.by))].map((x) => [x, x])} value={fBy} onChange={setFBy} count={(k) => bs.filter((b) => b.by === k).length} />
            <FilterSelect label="Source" options={[...new Set(bs.map((b) => b.source))].map((x) => [x, x])} value={fSrc} onChange={setFSrc} count={(k) => bs.filter((b) => b.source === k).length} />
            <select className="ov-select" value={range} onChange={(e) => setRange(e.target.value)} aria-label="Date range">
              <option value="all">All dates</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option>
            </select>
          </>
        )}
      </div>
      {view === "attention" ? <AttentionTab h={h} items={att} resolve={resolve} admin={admin} /> : (
        <>
          {histErr && <span className="shx-small" style={{ color: "var(--red-700)" }}>{histErr}</span>}
          <span className="shx-small">Each upload batch, how every file was identified and what the system did. If a CV matches an application that already exists, it is read and scored again and the newest version becomes the one in use; older versions stay for comparison.</span>
          {list.length ? list.map((b) => {
            const isOpen = openB.includes(b.id), files = b.files.filter(fileOk);
            const [cls, ic] = srcInfo(b.source);
            return (
              <section key={b.id} className="up-batch">
                <button type="button" className="up-batch__h" aria-expanded={isOpen} onClick={() => setOpenB((o) => (isOpen ? o.filter((x) => x !== b.id) : [...o, b.id]))}>
                  <Icon name={isOpen ? "chevron-down" : "chevron-right"} size={14} />
                  <span className="up-batch__t"><b>{b.at}</b><small>{b.by} · {b.files.length} files</small></span>
                  <span className={"src-chip src--" + cls}><Icon name={ic} size={12} />{b.source}</span>
                  <span className="ad-sp" />
                  <span className="up-batch__k">{KIND_KEYS.map((k) => (cnt(b, k) ? <Badge key={k} tone={KIND[k][0] as never} icon={KIND[k][1]}>{KIND[k][2]} {cnt(b, k)}</Badge> : null))}</span>
                </button>
                {isOpen && (
                  <div className="up-files" role="table" aria-label={"Files in batch " + b.at}>
                    <div className="up-row up-row--h" role="row"><span>File</span><span>Identified as</span><span>Matched on</span><span>What the system did</span><span>Match</span><span>Handled by</span></div>
                    {files.map((f, i) => {
                      const [tone, fic, lab] = KIND[f.kind];
                      return (
                        <div key={i} className="up-row" role="row">
                          <span className="up-file"><Icon name="file-text" size={14} />{f.file}</span>
                          <span className="up-id">
                            <Badge tone={tone as never} icon={fic}>{lab}</Badge>
                            {f.cand && <button type="button" className="up-link" onClick={() => onOpenCand(f)}>{f.cand}</button>}
                            {f.since && <small>since {f.since} · <button type="button" className="up-link" onClick={() => onOpenCand(f, "history")}>View history</button></small>}
                          </span>
                          <span className="shx-small">{f.matched || "—"}</span>
                          <span className="up-did">{f.did}</span>
                          <span>{f.score != null ? <span className="sh-num up-score">{f.prev != null && <><s>{f.prev}</s><Icon name="arrow-right" size={12} /></>}{f.score}</span> : <span className="shx-small">—</span>}</span>
                          <span className="shx-small">{f.handled || "—"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          }) : <div className="jb-empty"><Icon name="filter-x" size={20} /><b>No uploads match these filters</b></div>}
        </>
      )}
    </div>
  );
}
