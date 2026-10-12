"use client";

import * as React from "react";
import { JD, srcInfo, type AttentionItem, type Batch, type BatchFile, type Candidate, type Job, type Role } from "./data";
import { AttentionTab, FilterSelect, type CandHandlers, type CandPreset } from "./candidates";
import { Badge, Button, Icon, Tabs } from "./ext";

type Style = React.CSSProperties;

const BAND_L = { strong: "Strong match", good: "Good match", partial: "Partial", limited: "Limited", review: "Needs manual review" } as const;
const BAND_C: Record<keyof typeof BAND_L, string> = {
  strong: "var(--green-700)", good: "var(--z8-green-500, #2E8B57)", partial: "var(--z8-green-300, #7FC29B)", limited: "var(--z8-green-100, #D6EDDE)", review: "var(--neutral-300, #C5CEC9)",
};
const OV_SAMPLE = {
  opened: "02/09/2026",
  reached: { cv: 52, iv: 14, offer: 2, probation: 1, hired: 0 } as Record<string, number>,
  weeks: [["W36", 8], ["W37", 12], ["W38", 15], ["W39", 25]] as [string, number][],
  tth: { median: 38 },
};

function Card({ title, right, children, span, note }: { title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; span?: number; note?: React.ReactNode }) {
  return (
    <section className="ov-card" style={span ? { gridColumn: "span " + span } : undefined}>
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

export function OverviewTab({ job, cands, att, onFilter, onTab }: {
  job: Job; cands: Candidate[]; att: AttentionItem[]; user?: Role; onFilter: (p: CandPreset) => void; onTab: (tab: string, sub?: string) => void;
}) {
  const S = JD.stages;
  const open = job.headcount - job.hired;
  const atOffer = cands.filter((c) => c.stage === "offer" && c.sub !== "Rejected").length;
  const stale = cands.filter((c) => c.stage === "cv" && (c.sub === "New" || c.sub === "Consider") && c.days > 7);
  const noDecision = cands.filter((c) => c.stage === "iv" && c.sub !== "Passed" && c.sub !== "Failed" && (c.noNote || c.days > 7));
  const props = cands.filter((c) => c.proposal);
  const scoreErr = cands.filter((c) => c.st === "error");
  const subsOf = (id: string) => (S.find((s) => s.id === id)?.subs || []).map((x) => id + ":" + x);
  const alerts = ([
    job.daysLeft != null && open > 0 && { tone: job.daysLeft <= 14 ? "warn" : "info", icon: "calendar-clock", text: <>Deadline in <b>{job.daysLeft} days</b> · {open} of {job.headcount} still open · {atOffer} at Offer</>, go: () => onFilter({ stage: subsOf("offer") }) },
    stale.length > 0 && { tone: "warn", icon: "clock", text: <><b>{stale.length}</b> in CV Scan for more than 7 days</>, go: () => onFilter({ stage: ["cv:New", "cv:Consider"] }) },
    noDecision.length > 0 && { tone: "warn", icon: "message-square", text: <><b>{noDecision.length}</b> interviewed without notes or a decision</>, go: () => onFilter({ stage: ["iv:New", "iv:Consider"] }) },
    props.length > 0 && { tone: "info", icon: "send", text: <><b>{props.length}</b> move proposal waiting for approval</>, go: () => onFilter({ mine: true }) },
    scoreErr.length > 0 && { tone: "warn", icon: "sparkles", text: <><b>{scoreErr.length}</b> CV with AI scoring failed</>, go: () => onFilter({ scoring: ["error"] }) },
    att.length > 0 && { tone: "info", icon: "file-warning", text: <><b>{att.length}</b> upload and processing items need attention</>, go: () => onTab("uploads") },
  ] as (Alert | false)[]).filter((a): a is Alert => !!a);
  const risk = open > 0 && job.daysLeft != null && job.daysLeft <= 14 && atOffer < open;

  const funnel = S.map((s) => ({ s, n: cands.filter((c) => c.stage === s.id).length, subs: s.subs.map((sb) => [sb, cands.filter((c) => c.stage === s.id && c.sub === sb).length] as [string, number]) }));
  const R = OV_SAMPLE.reached, rk = ["cv", "iv", "offer", "probation", "hired"];
  const bands = (Object.keys(BAND_L) as (keyof typeof BAND_L)[]).map((b) => [b, cands.filter((c) => c.st === "done" && c.band === b).length] as const);
  const unscored: [string, number, string][] = [["Scoring", cands.filter((c) => c.st === "scoring").length, "scoring"], ["Scoring failed", scoreErr.length, "error"]];
  const maxB = Math.max(1, ...bands.map((b) => b[1]));
  const srcs = [...new Set(cands.map((c) => c.source))]
    .map((src) => {
      const l = cands.filter((c) => c.source === src);
      return [src, l.length, l.filter((c) => S.findIndex((s) => s.id === c.stage) > 0 || (c.stage === "cv" && c.sub === "Passed")).length] as const;
    })
    .sort((a, b) => b[1] - a[1]);
  const maxS = Math.max(1, ...srcs.map((s) => s[1]));
  const maxW = Math.max(...OV_SAMPLE.weeks.map((w) => w[1]));
  const kinds = (k: BatchFile["kind"]) => JD.batches.reduce((a, b) => a + b.files.filter((f) => f.kind === k).length, 0);

  return (
    <div className="ov-grid">
      <Card title="Hiring progress" span={4} note={"Open since " + OV_SAMPLE.opened + " · median " + OV_SAMPLE.tth.median + " days from CV to hire · click a stage or sub-stage to open the list"}>
        <div className="hc-top">
          <div className="hc-big"><b className="sh-num">{job.hired}</b><span>of {job.headcount} positions filled</span></div>
          {job.daysLeft != null && (
            <div className={"hc-dl" + (risk ? " is-risk" : "")}>
              <Icon name={risk ? "triangle-alert" : "calendar-check"} size={16} />
              <span><b className="sh-num">{job.daysLeft} days left</b><small>{risk ? "At risk · " + open + " open, " + atOffer + " at Offer" : "On track"} · deadline {job.deadline}</small></span>
            </div>
          )}
        </div>
        <div className="pf">
          {funnel.map(({ s, n, subs }, i) => {
            const filledCol = s.id === "probation" || s.id === "hired";
            const prev = i > 0 ? R[rk[i - 1]] : 0;
            return (
              <React.Fragment key={s.id}>
                {i > 0 && <span className={"pf__arrow" + (s.id === "hired" ? " is-in" : "")}><Icon name="chevron-right" size={14} /></span>}
                <div className={"pf__col" + (filledCol ? " is-filled" : "")} style={{ "--stc": s.color } as Style}>
                  <button type="button" className="pf__head" onClick={() => onFilter({ stage: s.subs.map((x) => s.id + ":" + x) })}>
                    <span className="pf__lab"><i />{s.label}</span>
                    <b className="sh-num">{n}</b>
                    <small>{i > 0 && prev ? Math.round((R[rk[i]] / prev) * 100) + "% reached · " + R[s.id] + " total" : R[s.id] + " received"}</small>
                  </button>
                  {s.subs.length > 1 && (
                    <div className="pf__subs">
                      {subs.map(([sb, k]) => (
                        <button type="button" key={sb} className="pf__sub" disabled={!k} onClick={() => onFilter({ stage: [s.id + ":" + sb] })}><span>{sb}</span><b className="sh-num">{k}</b></button>
                      ))}
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
        <div className="pf__hc">
          <span>Positions</span>
          <div className="ov-prog">{Array.from({ length: job.headcount }).map((_, i) => <i key={i} className={i < job.hired ? "is-on" : ""} title={i < job.hired ? "Filled" : "Open"} />)}</div>
          <span className="sh-num">{job.hired} filled · {open} open</span>
        </div>
      </Card>
      <Card title="Needs your eye" span={2} right={<span className="shx-small">{alerts.length} items</span>}>
        {alerts.length ? (
          <div className="ov-alerts">
            {alerts.map((a, i) => (
              <button type="button" key={i} className={"ov-alert ov-alert--" + a.tone} onClick={a.go}><Icon name={a.icon} size={16} /><span>{a.text}</span><Icon name="chevron-right" size={14} /></button>
            ))}
          </div>
        ) : <span className="shx-small">Nothing stuck right now.</span>}
      </Card>
      <Card title="Match bands" span={2} right={<span className="shx-small">One signal, not a ranking</span>}>
        {bands.map(([b, k]) => <Bar key={b} label={BAND_L[b]} v={k} max={maxB} color={BAND_C[b]} onClick={k ? () => onFilter({ band: [b] }) : undefined} />)}
        <div className="ov-mini">
          {unscored.map(([l, k, key]) => <button type="button" key={key} className="ov-subchip" disabled={!k} onClick={() => onFilter({ scoring: [key] })}>{l} <b className="sh-num">{k}</b></button>)}
        </div>
      </Card>
      <Card title="CV sources" span={2} note="Passed = cleared CV Scan or later">
        {srcs.map(([src, n, p]) => {
          const [cls, ic] = srcInfo(src);
          return (
            <div key={src} className="ov-src">
              <span className={"src-chip src--" + cls}><Icon name={ic} size={12} />{src}</span>
              <span className="ov-bar__t">
                <i style={{ width: (n / maxS) * 100 + "%", background: "var(--z8-green-200, #ADDABD)" }} />
                <i style={{ width: (p / maxS) * 100 + "%", background: "var(--green-700)", position: "absolute", left: 0, top: 0 }} />
              </span>
              <span className="sh-num ov-src__v">{p} / {n}</span>
            </div>
          );
        })}
        <div className="ov-legend"><span><i style={{ background: "var(--green-700)" }} />Passed CV Scan</span><span><i style={{ background: "var(--z8-green-200, #ADDABD)" }} />Received</span></div>
      </Card>
      <Card title="Upload activity" span={2} right={<Button size="sm" variant="ghost" iconRight="arrow-right" onClick={() => onTab("uploads", "history")}>Upload history</Button>}>
        <div className="ov-weeks">{OV_SAMPLE.weeks.map(([w, n]) => <div key={w} className="ov-week"><span className="sh-num">{n}</span><i style={{ height: (n / maxW) * 64 + "px" }} /><small>{w}</small></div>)}</div>
        <div className="ov-mini">
          <span className="ov-subchip">New candidates <b className="sh-num">{kinds("new")}</b></span>
          <span className="ov-subchip">Existing <b className="sh-num">{kinds("existing") + kinds("dup_job") + kinds("same_file")}</b></span>
          <span className="ov-subchip">Failed <b className="sh-num">{kinds("failed")}</b></span>
        </div>
      </Card>
    </div>
  );
}

const KIND: Record<BatchFile["kind"], [string, string, string]> = {
  new: ["success", "user-plus", "New candidate"], existing: ["info", "history", "Existing candidate"], dup_job: ["warning", "copy", "Already in this position"],
  same_file: ["warning", "file-check", "Same file"], suspected: ["warning", "users", "Possible duplicate"], failed: ["danger", "file-x", "Failed"],
};
const KIND_KEYS = Object.keys(KIND) as BatchFile["kind"][];

export function UploadsTab({ h, att, resolve, admin, view, setView, onOpenCand }: {
  h: CandHandlers; att: AttentionItem[]; resolve: (id: string) => void; admin?: boolean; view: string; setView: (v: string) => void; isPool?: boolean;
  onOpenCand: (f: BatchFile, tab?: string) => void;
}) {
  const bs: Batch[] = JD.batches;
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
