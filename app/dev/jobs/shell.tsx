"use client";

import * as React from "react";
import { Button, Icon, MoveToMenu, NotificationItem, type MoveItem } from "./ext";
import { JD, stageColor, stageOf, type Candidate, type Notif, type Role, type StageId } from "./data";

type Style = React.CSSProperties;

const DN_IC: Record<string, React.ReactNode> = {
  dash: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
  jobs: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  cands: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
  users: <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3" /></>,
  pipes: <path d="M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 17.5l10 5 10-5" />,
  chap: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>,
  tpl: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M9 13h1M9 17h1M13 13h3M13 17h3" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  cal: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  bell: <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" />,
};
const Svg = ({ n }: { n: string }) => <svg viewBox="0 0 24 24" aria-hidden="true">{DN_IC[n]}</svg>;

const EMAIL: Record<string, string> = { hr: "hien.nguyen@zen8labs.com", ch: "huy.tran@zen8labs.com", rc: "linh.pham@zen8labs.com", iv: "duc.do@zen8labs.com" };
const PILL: Record<string, string> = { hr: "HR", ch: "Chapter Head", rc: "Recruiter", iv: "Interviewer" };

function initials(n: string) {
  const p = n.trim().split(/\s+/);
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export function Pop({ open, onClose, children, align = "right", top = 34, width }: {
  open: boolean; onClose: () => void; children: React.ReactNode; align?: "left" | "right"; top?: number; width?: number;
}) {
  if (!open) return null;
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={(e) => { e.stopPropagation(); onClose(); }} />
      <div style={{ position: "absolute", [align]: 0, top, zIndex: 41, minWidth: width || 220 }} onClick={(e) => e.stopPropagation()}>{children}</div>
    </>
  );
}

type NavKey = "dash" | "jobs" | "cands" | "cal" | "users" | "pipes" | "chap" | "tpl";

export function Shell({ user, crumbs, title, meta, actions, children, onHome, notifs = [], onNotif, active = "jobs", embedded = false }: {
  embedded?: boolean;
  user: Role;
  crumbs?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  onHome: () => void;
  notifs?: Notif[];
  onNotif: (n: Notif | null, kind?: "readall") => void;
  active?: NavKey;
}) {
  const [open, setOpen] = React.useState(false);
  const unread = notifs.filter((n) => n.unread).length;
  const ws: [NavKey, string, number | null][] = [
    ["dash", "Dashboard", null],
    ["jobs", "Position Management", user.key === "iv" ? 1 : 12],
    ["cands", "Candidates", user.key === "iv" ? 2 : 248],
    ["cal", "Calendar", null],
    ...(user.key === "hr" ? [["users", "Users", null] as [NavKey, string, null]] : []),
  ];
  const setup: [NavKey, string, null][] = user.key === "hr" || user.key === "ch" ? [["pipes", "Pipelines", null], ["chap", "Chapters", null], ["tpl", "Templates", null]] : [];
  const item = ([k, l, ct]: [NavKey, string, number | null]) => (
    <a key={k} className={k === active ? "on" : ""} aria-current={k === active ? "page" : undefined} href="#"
      onClick={(e) => { e.preventDefault(); if (k === active) onHome(); }}>
      <Svg n={k} />{l}{ct != null && <span className="ct">{ct}</span>}
    </a>
  );
  const ini = initials(user.name);
  const header = (emb: boolean) => (
        <div style={{ padding: emb ? "0 0 12px" : "16px 32px 12px", display: "flex", alignItems: "flex-end", gap: 16, flex: "none", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            {crumbs && <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>{crumbs}</div>}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--heading)" }}>{title}</h1>{meta}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", marginLeft: "auto" }}>{emb && bell}{actions}</div>
        </div>
  );
  const bell = (
          <span style={{ position: "relative" }}>
            <button type="button" className="dn-ib" aria-label={`Notifications, ${unread} unread`} onClick={() => setOpen(!open)}>
              <Svg n="bell" />{unread > 0 && <span className="dot" />}
            </button>
            <span aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{unread} new notifications</span>
            <Pop open={open} onClose={() => setOpen(false)} top={44} width={380}>
              <div className="sh-popover" style={{ width: 380, padding: 0, overflow: "hidden" }}>
                <div className="shx-row" style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                  <b style={{ fontWeight: 600 }}>Notifications</b><span className="shx-sp" />
                  <button type="button" className="sh-btn sh-btn--ghost sh-btn--sm" onClick={() => onNotif(null, "readall")}>Mark all read</button>
                </div>
                <div style={{ maxHeight: 420, overflow: "auto" }}>
                  {notifs.map((n) => (
                    <NotificationItem key={n.id} title={n.title} body={n.body} time={n.time} unread={n.unread} action={n.action}
                      onAction={() => { setOpen(false); onNotif(n); }} onClick={() => { setOpen(false); onNotif(n); }} />
                  ))}
                  {!notifs.length && <div style={{ padding: 20, textAlign: "center" }} className="shx-small">No notifications</div>}
                </div>
              </div>
            </Pop>
          </span>
  );
  if (embedded) {
    return (
      <div className="jb-root jb-root--embedded">
        {header(true)}
        <main style={{ paddingInline: 0 }}>{children}</main>
      </div>
    );
  }
  return (
    <div className="dn-app jb-root">
      <aside className="dn-side">
        <div className="dn-logo"><i />Smart Hire</div>
        <div className="dn-nlab">Workspace</div>
        <nav className="dn-nav" aria-label="Workspace">{ws.map(item)}</nav>
        {setup.length > 0 && (
          <>
            <div className="dn-nlab">Setup</div>
            <nav className="dn-nav" aria-label="Setup">{setup.map(item)}</nav>
          </>
        )}
        <div className="dn-me">
          <div className="dn-av">{ini}</div>
          <div style={{ minWidth: 0 }}>
            <b>{user.name.split(" ").slice(-1)[0]} <span className="dn-pill">{PILL[user.key]}</span></b>
            <small>{EMAIL[user.key]}</small>
          </div>
        </div>
      </aside>
      <div className="dn-main">
        <div className="dn-top">
          <div className="dn-search" role="search"><Svg n="search" /><span>Search candidates, jobs, people…</span><kbd>⌘K</kbd></div>
          <div style={{ flex: 1 }} />
          {bell}
          <div className="dn-av">{ini}</div>
        </div>
        {header(false)}
        <main style={{ flex: 1, minHeight: 0, overflow: "auto", paddingInline: 8 }}>{children}</main>
      </div>
    </div>
  );
}

export const stageIdx = (id: string) => JD.stages.findIndex((s) => s.id === id);

export type MoveHandlers = {
  onMove: (c: Candidate, to: StageId) => void;
  onSub: (c: Candidate, sub: string) => void;
  onReject: (c: Candidate) => void;
};

/** MoveToMenu items enforcing the is_passed / is_default rules. */
export function moveItems(c: Candidate, { onMove, onSub, onReject }: MoveHandlers, user?: Role): MoveItem[] {
  const S = JD.stages, i = stageIdx(c.stage), cur = S[i];
  const passed = c.sub === cur.pass, atDefault = c.sub === cur.def;
  const items: MoveItem[] = [{ heading: "Result in " + cur.label }];
  cur.subs.filter((s) => s !== c.sub).forEach((s) => items.push({
    label: s + " (same stage)",
    icon: s === cur.pass ? "circle-check" : /Fail|Decl|Not passed|Rejected/.test(s) ? "circle-x" : "circle-dot",
    onClick: () => onSub(c, s),
  }));
  items.push("-", { heading: "Move to" });
  S.forEach((s, j) => {
    if (j === i) return;
    if (j < i) {
      items.push(atDefault
        ? { label: s.label, icon: "undo-2", note: "Back one or more stages", onClick: () => onMove(c, s.id) }
        : { label: s.label, icon: "lock", disabled: true, note: `Back only while ${cur.label} is at "${cur.def}"` });
      return;
    }
    if (j === i + 1) {
      items.push(passed
        ? { label: s.label, icon: "arrow-right", shortcut: "M", note: user && !user.canDecide ? "Sent to Chapter Head as a proposal" : `Starts at "${s.def}"`, onClick: () => onMove(c, s.id) }
        : { label: s.label, icon: "lock", disabled: true, note: `Opens after ${cur.label} is ${cur.pass.toLowerCase()}` });
      return;
    }
    items.push({ label: s.label, icon: "lock", disabled: true, note: `Opens after ${S[j - 1].label} is ${S[j - 1].pass.toLowerCase()}` });
  });
  items.push("-", { label: user && !user.canDecide ? "Propose rejection…" : "Reject…", icon: "x", danger: true, shortcut: "X", onClick: () => onReject(c) });
  return items;
}

export function MoveButton({ c, h, user, size = "sm", label = "Move to…" }: { c: Candidate; h: MoveHandlers; user?: Role; size?: "sm" | "lg"; label?: string }) {
  const [open, setOpen] = React.useState(false);
  const wrap = <A extends unknown[]>(f: (...a: A) => void) => (...a: A) => { setOpen(false); f(...a); };
  return (
    <span style={{ position: "relative", display: "inline-flex" }} onClick={(e) => e.stopPropagation()}>
      <Button size={size} variant="secondary" icon="arrow-right-left" iconRight="chevron-down" onClick={() => setOpen(!open)}>{label}</Button>
      <Pop open={open} onClose={() => setOpen(false)} width={300}>
        <MoveToMenu items={moveItems(c, { onMove: wrap(h.onMove), onSub: wrap(h.onSub), onReject: wrap(h.onReject) }, user)} />
      </Pop>
    </span>
  );
}

export function StagePath({ c }: { c: Candidate }) {
  const S = JD.stages, i = stageIdx(c.stage);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", fontSize: 12 }}>
      {S.map((s, j) => (
        <React.Fragment key={s.id}>
          {j > 0 && <Icon name="chevron-right" size={12} style={{ color: "var(--neutral-400)" }} />}
          <span className={"jb-step" + (j === i ? " is-cur" : j < i ? " is-done" : j === i + 1 && c.sub !== S[i].pass ? " is-lock" : "")} style={{ "--stc": s.color } as Style}>
            {j === i ? `${s.label} - ${c.sub}` : s.label}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

export function StageChip({ stage, sub }: { stage: string; sub?: string }) {
  const s = JD.stages.find((x) => x.id === stage);
  return (
    <span className="stc-chip" style={{ "--stc": stageColor(stage) } as Style}>
      {s ? s.label : stage}{sub && <span className="stc-sub">- {sub}</span>}
    </span>
  );
}

export type ToastMsg = { icon?: string; title: React.ReactNode; body?: React.ReactNode; action?: { label: string; fn: () => void } } | null;

export function Toast({ t, onClose }: { t: ToastMsg; onClose: () => void }) {
  if (!t) return null;
  return (
    <div className="jb-toast" role="status">
      <Icon name={t.icon || "bell"} size={16} style={{ color: "var(--accent)", marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{t.title}</div>
        {t.body && <div style={{ color: "var(--fg-2)", fontSize: 13 }}>{t.body}</div>}
        {t.action && (
          <button type="button" className="sh-btn sh-btn--ghost sh-btn--sm" style={{ marginTop: 6, marginLeft: -10 }} onClick={() => { t.action!.fn(); onClose(); }}>{t.action.label}</button>
        )}
      </div>
      <button type="button" className="sh-iconbtn sh-iconbtn--sm" aria-label="Dismiss" onClick={onClose}><Icon name="x" size={14} /></button>
    </div>
  );
}

export { stageOf };
