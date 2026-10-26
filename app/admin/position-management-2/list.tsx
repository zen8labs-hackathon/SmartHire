"use client";

import * as React from "react";
import { type Job, type JobStatus, type Role } from "./data";
import { AIBadge, Avatar, Badge, Banner, Button, FileStatus, Icon, Input, JobRow, Menu, Select, Table, Tabs, type Column, type MenuItem } from "./ext";

export type JobId = number | "pool";
export type Go = (id: JobId | null, tab?: string | null, cand?: number | null) => void;

export const ST_TONE: Record<JobStatus, [string, string]> = { Open: ["success", "circle-dot"], Draft: ["dashed", "pencil"], "On hold": ["warning", "pause"], Closed: ["neutral", "archive"] };

export function visibleJobs(user: Role, J: Job[]) {
  // GET /api/admin/positions already scopes the list to the viewer's chapters and per-position grants.
  void user;
  return J;
}

function Headcount({ j }: { j: Job }) {
  const w = (n: number) => Math.min(100, (j.headcount ? n / j.headcount : 0) * 100) + "%";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 110 }}>
      <span className="sh-num" style={{ textAlign: "left" }}><b style={{ fontWeight: 600 }}>{j.hired}</b><span style={{ color: "var(--muted)" }}> / {j.headcount} hired</span></span>
      <span className="jb-meter"><i style={{ width: w(j.hired) }} /></span>
    </div>
  );
}

function Deadline({ j }: { j: Job }) {
  if (!j.deadline) return <span style={{ color: "var(--muted)" }}>Not set</span>;
  if (j.status === "Closed") return <span style={{ color: "var(--muted)" }}>{j.deadline}</span>;
  const left = j.daysLeft ?? 0;
  const risk = left <= 21 && j.hired < j.headcount;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span className="sh-num" style={{ textAlign: "left" }}>{j.deadline}</span>
      {risk ? <Badge tone="warning" icon="triangle-alert">{left} days · {j.headcount - j.hired} open</Badge> : <span style={{ fontSize: 12, color: "var(--muted)" }}>{left} days left</span>}
    </div>
  );
}

function RowMenu({ j, user, go, onClose, onHold, onReopen }: { j: Job; user: Role; go: Go; onClose: (j: Job) => void; onHold?: (j: Job) => void; onReopen?: (j: Job) => void }) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top?: number; bottom?: number; right: number }>({ right: 0 });
  const f = (fn: () => void) => () => { setOpen(false); fn(); };
  // The table wrapper clips overflow, so the menu is fixed-positioned from the button's rect.
  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!open) {
      const r = e.currentTarget.getBoundingClientRect();
      const right = window.innerWidth - r.right;
      setPos(window.innerHeight - r.bottom < 320 ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right });
    }
    setOpen(!open);
  };
  const items: MenuItem[] = [
    { label: "Open position", icon: "arrow-up-right", onClick: f(() => go(j.id)) },
    { label: "Description & criteria", icon: "file-text", onClick: f(() => go(j.id, "jd")) },
  ];
  if (user.key !== "rc") items.push({ label: "Access", icon: "shield", onClick: f(() => go(j.id, "access")) });
  if (user.key === "hr") {
    items.push("-");
    if (j.status === "Open") items.push({ label: "Put on hold", icon: "pause", onClick: f(() => onHold?.(j)) });
    if (j.status === "On hold" || j.status === "Closed") items.push({ label: "Reopen", icon: "rotate-ccw", onClick: f(() => onReopen?.(j)) });
    if (j.status === "Open" || j.status === "On hold") items.push({ label: "Close position…", icon: "archive", danger: true, onClick: f(() => onClose(j)) });
  }
  return (
    <span style={{ position: "relative", display: "inline-flex" }} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="sh-iconbtn sh-iconbtn--sm" aria-label="Position actions" onClick={toggle}><Icon name="ellipsis" size={16} /></button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div style={{ position: "fixed", ...pos, zIndex: 41, minWidth: 210 }} onClick={(e) => e.stopPropagation()}><Menu items={items} /></div>
        </>
      )}
    </span>
  );
}

export function JobsList({ user, go, onCreate, onUpload, onCloseJob, onRetry, onHold, onReopen, chapters, jobs, pool }: {
  user: Role; go: Go; onCreate: () => void; onUpload: (id: JobId) => void; onCloseJob: (j: Job) => void; onRetry?: (j: Job) => void; onHold?: (j: Job) => void; onReopen?: (j: Job) => void; chapters?: string[]; jobs: Job[]; pool?: { candidates: number; attention: number } | null;
}) {
  const [tab, setTab] = React.useState("Open");
  const [q, setQ] = React.useState("");
  const [type, setType] = React.useState("All types");
  const [chap, setChap] = React.useState("All chapters");
  const [layout, setLayout] = React.useState("table");
  const [flow, setFlow] = React.useState("All structures");
  const all = visibleJobs(user, jobs);
  const count = (s: string) => all.filter((j) => j.status === s).length;
  const rows = all.filter((j) => (tab === "All" || j.status === tab) && (type === "All types" || j.type === type) && (chap === "All chapters" || j.chapter === chap) && (flow === "All structures" || (flow === "Old structure" ? !!j.legacy : !j.legacy)) && (!q || (j.title + " #" + j.id).toLowerCase().includes(q.toLowerCase())));
  const P = pool ?? null;
  const scope = user.allJobs
    ? null
    : user.chapter
      ? "Showing positions in chapter " + user.chapter + ". Positions from other chapters are not visible to you."
      : user.key === "iv"
        ? "Showing the position where you have interviews scheduled. You only see candidates assigned to you."
        : "Showing positions shared with you. Expected salary is hidden on your role.";
  const openJob = (j: Job) => go(j.id, j.status === "Draft" ? "jd" : null);

  const cols: Column<Job>[] = [
    {
      key: "title", label: "Position", render: (j) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{j.title}</span>
            {j.processing && <FileStatus status="processing" label="Extracting JD" />}
            {j.procError && !j.processing && (
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }} title={j.procError}>
                <Badge tone="warning" icon="triangle-alert">JD extraction failed</Badge>
                {onRetry && user.canCreate && <button type="button" className="jb-linkchip" onClick={(e) => { e.stopPropagation(); onRetry(j); }}>Retry</button>}
              </span>
            )}
            {j.legacy && <span title="This position still uses the old pipeline structure"><Badge tone="warning" icon="history">Cấu trúc cũ</Badge></span>}
            {j.fresh && !j.processing && <AIBadge unconfirmed title="Fields filled from JD by AI" note="Review on the position page before opening." />}
          </span>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>#{j.id} · {j.chapter} · {j.level}{j.draftNote ? " · " + j.draftNote : ""}</span>
        </div>
      ),
    },
    { key: "type", label: "Type", render: (j) => <Badge tone={j.type === "Internship" ? "info" : "outline"}>{j.type}</Badge> },
    { key: "status", label: "Status", render: (j) => { const [t, i] = ST_TONE[j.status]; return <Badge tone={t} icon={i}>{j.status}</Badge>; } },
    { key: "hc", label: "Headcount", render: (j) => <Headcount j={j} /> },
    { key: "deadline", label: "Hiring deadline", render: (j) => <Deadline j={j} /> },
    { key: "candidates", label: "Candidates", align: "right", render: (j) => <span className="sh-num">{j.candidates}</span> },
    { key: "owner", label: "Owner", render: (j) => <Avatar name={j.owner} size={24} /> },
    { key: "m", label: "", width: 44, render: (j) => <RowMenu j={j} user={user} go={go} onClose={onCloseJob} onHold={onHold} onReopen={onReopen} /> },
  ];

  return (
    <div style={{ padding: "0 0 32px", display: "flex", flexDirection: "column", gap: 12 }}>
      <Tabs value={tab} onChange={setTab} tabs={(["Open", "Draft", "On hold", "Closed"] as const).map((s) => ({ id: s, label: s, count: count(s) })).concat([{ id: "All", label: "All", count: all.length }] as never[])} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Input icon="search" size="sm" placeholder="Search by title or #ID" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
        <Select size="sm" aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} options={["All types", "Full-time", "Internship"]} style={{ width: 150 }} />
        {all.some((j) => j.legacy) && <Select size="sm" aria-label="Structure" value={flow} onChange={(e) => setFlow(e.target.value)} options={["All structures", "Old structure", "New structure"]} style={{ width: 160 }} />}
        {user.allJobs && <Select size="sm" aria-label="Chapter" value={chap} onChange={(e) => setChap(e.target.value)} options={["All chapters", ...(chapters ?? [...new Set(all.map((j) => j.chapter))])]} style={{ width: 160 }} />}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Sorted by deadline</span>
        <Tabs variant="segmented" value={layout} onChange={setLayout} tabs={[{ id: "table", label: "Table" }, { id: "cards", label: "Cards" }]} />
      </div>
      {scope && <Banner tone="neutral" icon={user.chapter ? "users" : "lock"}>{scope}</Banner>}
      {rows.length ? (
        layout === "cards" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 12 }}>
            {rows.map((j) => <JobRow key={j.id} job={j} onOpen={() => openJob(j)} onAttention={() => go(j.id, "attention")} />)}
          </div>
        ) : (
          <Table columns={cols} rows={rows} onRowClick={openJob} />
        )
      ) : (
        <div className="jb-empty">
          <Icon name="briefcase" size={20} />
          <b>No {tab === "All" ? "" : tab.toLowerCase() + " "}positions{q ? ' match "' + q + '"' : ""}</b>
          {user.canCreate && <Button size="sm" icon="plus" onClick={onCreate}>Open new position</Button>}
        </div>
      )}
    </div>
  );
}
