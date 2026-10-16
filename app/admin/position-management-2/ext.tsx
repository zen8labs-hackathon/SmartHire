"use client";

// Local ports of the SmartHire design-system primitives and the sh-ext-core /
// sh-ext-flow pattern components used by the Jobs design. The design passes
// icon names as strings, so primitives here take `icon: string`.

import * as React from "react";
import {
  Archive, ArrowLeft, ArrowRight, CircleArrowRight, ArrowRightLeft, ArrowUpRight, BadgeCheck, Bell, Briefcase, Building2,
  Calendar, CalendarCheck, CalendarClock, CalendarPlus, Check, ChevronDown, ChevronRight, ChevronUp,
  Circle, CircleAlert, CircleCheck, CircleDashed, CircleDot, CircleX, Clock, Contact, Copy, Ellipsis, Eye, EyeOff,
  FileText, FileUp, FileWarning, FileX, FilterX, Flag, GitCompare, GitMerge, Globe, GraduationCap, History, Hourglass,
  Inbox, Layers, Link, ListChecks, LoaderCircle, Lock, Mail, Maximize2, Minimize2, MessageSquare, Pause, Pencil, Plus,
  RefreshCw, RotateCcw, Route, Search, Send, Shield, Sparkles, Trash2, TriangleAlert, Undo2, Upload, User, UserCheck,
  UserPlus, UserRound, Users, X, Cpu, Download, FileCheck, LayoutGrid, List, LogIn, LogOut, Merge, Move, Save, School, UserCog, UserX, Settings,
  GripVertical, ArrowUp, ArrowDown, ClipboardList, Workflow,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  archive: Archive, "arrow-left": ArrowLeft, "arrow-right": ArrowRight, "arrow-right-circle": CircleArrowRight, "arrow-right-left": ArrowRightLeft,
  "arrow-up-right": ArrowUpRight, "badge-check": BadgeCheck, bell: Bell, briefcase: Briefcase, "building-2": Building2,
  calendar: Calendar, "calendar-check": CalendarCheck, "calendar-clock": CalendarClock, "calendar-plus": CalendarPlus,
  check: Check, "chevron-down": ChevronDown, "chevron-right": ChevronRight, "chevron-up": ChevronUp,
  "circle-alert": CircleAlert, "circle-check": CircleCheck, "circle-dashed": CircleDashed, "circle-dot": CircleDot,
  "circle-x": CircleX, clock: Clock, contact: Contact, copy: Copy, ellipsis: Ellipsis, eye: Eye, "eye-off": EyeOff,
  "file-text": FileText, "file-up": FileUp, "file-warning": FileWarning, "file-x": FileX, "filter-x": FilterX, flag: Flag,
  "git-compare": GitCompare, "git-merge": GitMerge, globe: Globe, "graduation-cap": GraduationCap, history: History,
  hourglass: Hourglass, inbox: Inbox, layers: Layers, link: Link, linkedin: Briefcase, "list-checks": ListChecks,
  "loader-circle": LoaderCircle, lock: Lock, mail: Mail, "maximize-2": Maximize2, "minimize-2": Minimize2,
  "message-square": MessageSquare, pause: Pause, pencil: Pencil, plus: Plus, "refresh-cw": RefreshCw,
  "rotate-ccw": RotateCcw, route: Route, search: Search, send: Send, shield: Shield, sparkles: Sparkles,
  "trash-2": Trash2, "triangle-alert": TriangleAlert, "undo-2": Undo2, upload: Upload, user: User,
  "user-check": UserCheck, "user-plus": UserPlus, "user-round": UserRound, users: Users, x: X,
  cpu: Cpu, download: Download, "file-check": FileCheck, grid: LayoutGrid, list: List, "log-in": LogIn, "log-out": LogOut,
  merge: Merge, move: Move, save: Save, school: School, "user-cog": UserCog, "user-x": UserX, settings: Settings,
  "grip-vertical": GripVertical, "arrow-up": ArrowUp, "arrow-down": ArrowDown, "clipboard-list": ClipboardList, workflow: Workflow,
};

type Style = React.CSSProperties | null | undefined;

/* ───────────────────────── primitives ───────────────────────── */

export function Icon({ name, size = 16, className, style, label }: { name: string; size?: number; className?: string; style?: Style; label?: string }) {
  const C = ICONS[name] || Circle;
  return <C size={size} className={className} style={style ?? undefined} aria-hidden={label ? undefined : true} aria-label={label} role={label ? "img" : undefined} />;
}

type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
  size?: "sm" | "lg";
  icon?: string;
  iconRight?: string;
  "data-cancel"?: boolean;
};
export function Button({ variant = "primary", size, icon, iconRight, children, className, ...rest }: ButtonProps) {
  const is = size === "sm" ? 14 : 16;
  return (
    <button type="button" className={`sh-btn sh-btn--${variant}${size ? ` sh-btn--${size}` : ""}${className ? ` ${className}` : ""}`} {...rest}>
      {icon && <Icon name={icon} size={is} />}
      {children}
      {iconRight && <Icon name={iconRight} size={is} />}
    </button>
  );
}

export type Tone = "neutral" | "outline" | "brand" | "success" | "warning" | "danger" | "info" | "ai" | "lock" | "dashed";
export function Badge({ tone = "neutral", icon, children, style }: { tone?: Tone | string; icon?: string; children?: React.ReactNode; style?: Style }) {
  return <span className={`sh-chip sh-chip--${tone}`} style={style ?? undefined}>{icon && <Icon name={icon} size={12} />}{children}</span>;
}
export const StatusChip = Badge;

export function LockChip({ label = "Restricted", reason }: { label?: string; reason?: string }) {
  return <span className="sh-chip sh-chip--lock" title={reason}><Icon name="lock" size={12} />{label}</span>;
}

type Opt = string | { value: string; label: string };
export function Select({ label, size, value, onChange, options, style, hint, disabled, className, "aria-label": ariaLabel }: {
  label?: string; size?: "sm"; value?: string; onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void; options: Opt[]; style?: Style; hint?: React.ReactNode; disabled?: boolean; className?: string; "aria-label"?: string;
}) {
  const id = React.useId();
  const sel = (
    <div className={`sh-input${size ? ` sh-input--${size}` : ""}${className ? ` ${className}` : ""}`} style={label ? undefined : style ?? undefined}>
      <select id={id} value={value} onChange={onChange} disabled={disabled} aria-label={label ? undefined : ariaLabel}>
        {options.map((o) => typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Icon name="chevron-down" size={14} style={{ color: "var(--muted)", pointerEvents: "none" }} />
    </div>
  );
  if (!label) return sel;
  return <div className="sh-field" style={style ?? undefined}><label className="sh-field__label" htmlFor={id}>{label}</label>{sel}{hint && <span className="sh-field__hint">{hint}</span>}</div>;
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "style"> & {
  label?: string; icon?: string; size?: "sm"; ai?: boolean; suffix?: React.ReactNode; error?: string; hint?: string; style?: Style;
};
export function Input({ label, icon, size, ai, suffix, error, hint, style, readOnly, ...rest }: InputProps) {
  const id = React.useId();
  const cls = `sh-input${size ? ` sh-input--${size}` : ""}${ai ? " sh-input--ai" : ""}${readOnly ? " sh-input--readonly" : ""}${error ? " sh-input--invalid" : ""}`;
  const box = (
    <div className={cls} style={label || hint || error ? undefined : style ?? undefined}>
      {icon && <Icon name={icon} size={14} style={{ color: "var(--muted)" }} />}
      <input id={id} readOnly={readOnly} aria-invalid={!!error || undefined} {...rest} />
      {suffix && <span className="shx-small">{suffix}</span>}
    </div>
  );
  if (!label && !hint && !error) return box;
  return (
    <div className="sh-field" style={style ?? undefined}>
      {label && <label className="sh-field__label" htmlFor={id}>{label}</label>}
      {box}
      {error ? <span className="sh-field__error">{error}</span> : hint ? <span className="sh-field__hint">{hint}</span> : null}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, className }: { checked?: boolean; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; label?: React.ReactNode; className?: string }) {
  return (
    <label className={`sh-check${checked ? " sh-check--on" : ""}${className ? ` ${className}` : ""}`}>
      <input type="checkbox" checked={!!checked} onChange={onChange ?? (() => {})} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
      <span className="sh-check__box">{checked && <Icon name="check" size={12} />}</span>
      {label}
    </label>
  );
}

export function Radio({ checked, onChange, label, name }: { checked?: boolean; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; label?: React.ReactNode; name?: string }) {
  return (
    <label className={`sh-check${checked ? " sh-check--on" : ""}`}>
      <input type="radio" name={name} checked={!!checked} onChange={onChange ?? (() => {})} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
      <span className="sh-check__box sh-check__box--radio" />
      {label}
    </label>
  );
}

export function Switch({ checked, disabled, onChange, label }: { checked?: boolean; disabled?: boolean; onChange?: (v: boolean) => void; label?: React.ReactNode }) {
  return (
    <label className={`sh-switch${checked ? " sh-switch--on" : ""}`} style={disabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}>
      <input type="checkbox" role="switch" checked={!!checked} disabled={disabled} onChange={(e) => onChange && onChange(e.target.checked)} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
      <span className="sh-switch__track" />
      {label}
    </label>
  );
}

const dialogStack: object[] = [];
export function Dialog({ title, description, width = 480, onClose, footer, children }: {
  title: React.ReactNode; description?: React.ReactNode; width?: number; onClose?: () => void; footer?: React.ReactNode; children?: React.ReactNode;
}) {
  const tid = React.useId();
  React.useEffect(() => {
    // Only the top-most dialog reacts to Escape, so nested dialogs close one at a time.
    const token = {};
    dialogStack.push(token);
    const k = (e: KeyboardEvent) => e.key === "Escape" && dialogStack[dialogStack.length - 1] === token && onClose && onClose();
    addEventListener("keydown", k);
    return () => { removeEventListener("keydown", k); const i = dialogStack.indexOf(token); if (i >= 0) dialogStack.splice(i, 1); };
  }, [onClose]);
  return (
    <div className="sh-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div className="sh-dialog" role="dialog" aria-modal="true" aria-labelledby={tid} style={{ width, maxWidth: "calc(100vw - 32px)" }}>
        <div className="sh-dialog__head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id={tid} className="sh-dialog__title">{title}</h2>
            {description && <div className="sh-dialog__desc">{description}</div>}
          </div>
          {onClose && <button type="button" className="sh-iconbtn sh-iconbtn--sm" aria-label="Close" onClick={onClose}><Icon name="x" size={16} /></button>}
        </div>
        {children && <div className="sh-dialog__body">{children}</div>}
        {footer && <div className="sh-dialog__foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const ini = name.split(/\s+/).filter(Boolean).slice(-2).map((p) => p[0]).join("").toUpperCase();
  return <span className="sh-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }} aria-hidden="true">{ini}</span>;
}

const BANNER_ICON: Record<string, string> = { info: "circle-alert", warning: "triangle-alert", danger: "circle-x", success: "circle-check", ai: "sparkles", neutral: "circle-alert" };
export function Banner({ tone = "info", icon, title, action, children }: { tone?: string; icon?: string; title?: React.ReactNode; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className={`sh-banner sh-banner--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon name={icon || BANNER_ICON[tone] || "circle-alert"} size={16} className="sh-banner__icon" />
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div className="sh-banner__title">{title}</div>}
        {children && <div>{children}</div>}
      </div>
      {action && <div style={{ flex: "none" }}>{action}</div>}
    </div>
  );
}

export function Card({ title, span, note, right, children, style }: { title?: React.ReactNode; span?: number; note?: React.ReactNode; right?: React.ReactNode; children?: React.ReactNode; style?: Style }) {
  return (
    <section className="sh-card" style={{ ...(span ? { gridColumn: `span ${span}` } : null), ...(style || null) }}>
      {(title || right) && (
        <div className="sh-card__head">
          <div style={{ flex: 1, minWidth: 0 }}>
            {title && <h3 className="sh-card__title">{title}</h3>}
            {note && <div className="shx-small">{note}</div>}
          </div>
          {right}
        </div>
      )}
      <div className="sh-card__body">{children}</div>
    </section>
  );
}

type TabDef = string | { id: string; label: React.ReactNode; count?: number };
export function Tabs({ value, onChange, tabs, variant }: { value: string; onChange?: (id: string) => void; tabs: TabDef[]; variant?: "segmented" }) {
  return (
    <div className={variant === "segmented" ? "sh-segmented" : "sh-tabs"} role="tablist">
      {tabs.map((t) => {
        const d = typeof t === "string" ? { id: t, label: t } : t;
        return (
          <button key={d.id} type="button" role="tab" className="sh-tab" aria-selected={d.id === value} onClick={() => onChange && onChange(d.id)}>
            {d.label}
            {"count" in d && d.count != null && <span className="sh-tab__count">{d.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export type MenuItem = { label: React.ReactNode; icon?: string; onClick?: () => void; danger?: boolean; disabled?: boolean } | "-";
export function Menu({ items }: { items: MenuItem[] }) {
  return (
    <div className="sh-menu sh-popover" style={{ background: "#fff" }} role="menu">
      {items.map((it, i) => it === "-" ? <div key={i} className="shx-menu__sep" role="separator" /> : (
        <button key={i} type="button" role="menuitem" disabled={it.disabled} className={`sh-menu__item${it.danger ? " sh-menu__item--danger" : ""}`} onClick={it.onClick}>
          {it.icon && <Icon name={it.icon} size={14} />}{it.label}
        </button>
      ))}
    </div>
  );
}

export type Column<R> = { key: string; label: React.ReactNode; render?: (r: R) => React.ReactNode; align?: "left" | "right" | "center"; width?: number | string; sticky?: "right" };
export function Table<R extends { id: string | number }>({ columns, rows, onRowClick, compact, selectable, selected = [], onSelect }: {
  columns: Column<R>[]; rows: R[]; onRowClick?: (r: R) => void; compact?: boolean; selectable?: boolean; selected?: (string | number)[]; onSelect?: (ids: (string | number)[]) => void;
}) {
  const all = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const toggle = (id: string | number) => onSelect && onSelect(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="sh-table-wrap">
      <table className={`sh-table${compact ? " sh-table--compact" : ""}`}>
        <thead>
          <tr>
            {selectable && <th style={{ width: 36 }}><Checkbox checked={all} onChange={() => onSelect && onSelect(all ? [] : rows.map((r) => r.id))} /></th>}
            {columns.map((c) => <th key={c.key} className={(c.align === "right" ? "sh-num" : "") + (c.sticky ? " sh-stick-r" : "") || undefined} style={{ width: c.width, textAlign: c.align }}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} aria-selected={selected.includes(r.id) || undefined} onClick={onRowClick ? () => onRowClick(r) : undefined} style={onRowClick ? { cursor: "pointer" } : undefined}>
              {selectable && <td onClick={(e) => e.stopPropagation()}><Checkbox checked={selected.includes(r.id)} onChange={() => toggle(r.id)} /></td>}
              {columns.map((c) => (
                <td key={c.key} className={(c.align === "right" ? "sh-num" : "") + (c.sticky ? " sh-stick-r" : "") || undefined} style={{ textAlign: c.align }}>
                  {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────────── sh-ext-core ───────────────────────── */

export type BandKey = "strong" | "good" | "partial" | "limited" | "review";
const BANDS: Record<BandKey, string> = { strong: "Strong match", good: "Good match", partial: "Partial", limited: "Limited", review: "Needs manual review" };
export function MatchBand({ band = "good", score, compact }: { band?: BandKey; score?: number | null; compact?: boolean }) {
  return (
    <span className={"shx-band shx-band--" + band + (compact ? " shx-band--compact" : "")} title={"AI match: " + BANDS[band] + (score != null ? " (" + score + ")" : "")}>
      {band === "review" && <Icon name="eye" size={12} />}{BANDS[band]}{!compact && score != null && band !== "review" && <small>{score}</small>}
    </span>
  );
}

export type FileStatusKey = "pending" | "processing" | "done" | "existing" | "unreadable" | "error" | "duplicate" | "contact";
const FS: Record<FileStatusKey, [string, string, string, boolean?]> = {
  pending: ["neutral", "clock", "Queued"], processing: ["info", "loader-circle", "Reading & scoring", true], done: ["success", "check", "Done"],
  existing: ["info", "copy", "Existing candidate"], unreadable: ["warning", "triangle-alert", "Could not read"], error: ["danger", "circle-x", "System error"],
  duplicate: ["warning", "users", "Possible duplicate"], contact: ["warning", "contact", "Contact missing"],
};
export function FileStatus({ status = "pending", label }: { status?: FileStatusKey; label?: string }) {
  const [tone, icon, text, spin] = FS[status] || FS.pending;
  return <span className={"sh-chip sh-chip--" + tone}><Icon name={icon} size={12} className={spin ? "sh-spin" : ""} />{label || text}</span>;
}

export function AIBadge({ label = "AI", unconfirmed, meta, note = "May be wrong. Check against the original CV before deciding.", title = "AI-generated content" }: {
  label?: string; unconfirmed?: boolean; meta?: Record<string, string> | null; note?: string; title?: string;
}) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [open]);
  return (
    <span style={{ position: "relative", display: "inline-flex" }} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="shx-ai" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="sparkles" size={11} />{label}{unconfirmed && " · unconfirmed"}</button>
      {open && (
        <>
          <span style={{ position: "fixed", inset: 0, zIndex: 59 }} onClick={() => setOpen(false)} />
          <span className="shx-pop" role="dialog" aria-label={title}>
            <span className="shx-pop__t"><Icon name="sparkles" size={14} />{title}</span>
            {meta && <span className="shx-kv">{Object.entries(meta).map(([k, v]) => <React.Fragment key={k}><span>{k}</span><span className={k === "Model" || k === "Provider" ? "shx-mono" : ""}>{v}</span></React.Fragment>)}</span>}
            <span style={{ color: "var(--muted)" }}>{note}</span>
          </span>
        </>
      )}
    </span>
  );
}

export function RestrictedValue({ label = "Restricted", reason = "Only HR, Admin and the position’s Chapter Head can see this.", inline }: { label?: string; reason?: string; inline?: boolean }) {
  if (!inline) return <LockChip label={label} reason={reason} />;
  return <span className="shx-row" style={{ flexWrap: "wrap" }}><span className="shx-lock"><Icon name="lock" size={12} />{label}</span><span className="shx-small">{reason}</span></span>;
}

export function IdentityTag({ kind, since, count }: { kind: "existing" | "apps" | "hired" | "official" | "pool" | "alumni"; since?: string; count?: number }) {
  if (kind === "existing") return <Badge tone="info" icon="history">Existing candidate{since ? " · " + since : ""}</Badge>;
  if (kind === "apps") return <Badge tone="outline" icon="layers">{count} applications</Badge>;
  if (kind === "hired") return <span className="sh-chip shx-gold"><Icon name="badge-check" size={12} />Hired</span>;
  if (kind === "official") return <span className="sh-chip shx-gold"><Icon name="badge-check" size={12} />Official staff</span>;
  if (kind === "pool") return <Badge tone="outline" icon="archive">Talent pool</Badge>;
  if (kind === "alumni") return <Badge tone="brand" icon="building-2">Ex-employee</Badge>;
  return null;
}

export type EntityTab = { id: string; label: React.ReactNode; count?: number | null; warn?: boolean };
export function EntityTabs({ tabs = [], value, onChange }: { tabs?: EntityTab[]; value: string; onChange?: (id: string) => void }) {
  return (
    <div className="shx-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" className="shx-tab" aria-selected={t.id === value} onClick={() => onChange && onChange(t.id)}>
          {t.label}
          {t.count != null && <span className={"shx-cnt" + (t.warn && t.count ? " shx-cnt--warn" : "")} aria-label={t.count + (t.warn ? " to resolve" : "")}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function NotificationItem({ title, body, time, unread, action, onAction, onClick }: {
  title: React.ReactNode; body?: React.ReactNode; time?: string; unread?: boolean; action?: string; onAction?: () => void; onClick?: () => void;
}) {
  return (
    <div className="shx-notif" data-unread={!!unread} onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined}>
      <div className="shx-row"><b style={{ fontWeight: 600 }}>{title}</b><span className="shx-sp" /><span className="shx-small">{time}</span></div>
      {body && <span style={{ color: "var(--fg-2)" }}>{body}</span>}
      {action && <div><Button size="sm" onClick={(e) => { e.stopPropagation(); if (onAction) onAction(); }}>{action}</Button></div>}
    </div>
  );
}

export function CandidateHeader({ name, tags, meta, sync, level = 2 }: { name: React.ReactNode; tags?: React.ReactNode; meta?: React.ReactNode; sync?: React.ReactNode; level?: 1 | 2 | 3 }) {
  const H = ("h" + level) as "h1" | "h2" | "h3";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <div className="shx-row" style={{ flexWrap: "wrap" }}><H style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--foreground)" }}>{name}</H>{tags}</div>
      {meta && <span className="shx-small">{meta}</span>}
      {sync && <span style={{ fontSize: 12, color: "var(--accent)", display: "inline-flex", gap: 4, alignItems: "center" }}><Icon name="refresh-cw" size={12} />{sync}</span>}
    </div>
  );
}

export type AppStatus = "open" | "hired" | "official" | "probation" | "awaiting" | "pool" | "ended";
export function ApplicationRow({ job, date, stage, band, score, status = "open", salaryRestricted, note, onClick }: {
  job: React.ReactNode; date?: string; stage?: React.ReactNode; band?: BandKey; score?: number; status?: AppStatus; salaryRestricted?: boolean; note?: string; onClick?: () => void;
}) {
  const st = {
    open: <Badge tone="info" icon="circle-dot">Open</Badge>, hired: <IdentityTag kind="hired" />, official: <IdentityTag kind="official" />,
    probation: <Badge tone="success" icon="user-check">On probation</Badge>, awaiting: <Badge tone="neutral" icon="clock">Awaiting start</Badge>,
    pool: <IdentityTag kind="pool" />, ended: <Badge tone="neutral">Ended</Badge>,
  }[status];
  return (
    <div className={"shx-card" + (onClick ? " shx-card--i" : "")} role={onClick ? "link" : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick}>
      <div className="shx-row"><b style={{ fontWeight: 600 }}>{job}</b><span className="shx-sp" />{band ? <MatchBand band={band} score={score} /> : st}</div>
      <div className="shx-row">
        <span className="shx-small">{date}{stage ? <> · {stage}</> : ""}{note ? " · " + note : ""}</span><span className="shx-sp" />
        {band && st}{salaryRestricted && <span className="shx-lock"><Icon name="lock" size={12} />Salary</span>}
      </div>
    </div>
  );
}

export function CVVersionItem({ version, active, date, change, parseError, onView, onCompare }: {
  version: number; active?: boolean; date?: string; change?: string; parseError?: boolean; onView?: () => void; onCompare?: () => void;
}) {
  return (
    <div className="shx-card">
      <div className="shx-row"><b style={{ fontWeight: 600 }}>CV v{version}</b>{active && <Badge tone="success" icon="check">In use</Badge>}{parseError && <FileStatus status="unreadable" />}<span className="shx-sp" /><span className="shx-small shx-mono">{date}</span></div>
      {change && <span className="shx-small">Changes: {change}</span>}
      <div className="shx-row" style={{ marginLeft: -10 }}>
        <Button size="sm" variant="ghost" icon="file-text" onClick={onView}>View CV</Button>
        {version > 1 && <Button size="sm" variant="ghost" icon="git-compare" onClick={onCompare}>Compare with v{version - 1}</Button>}
      </div>
    </div>
  );
}

export type TimelineEntry = { text: React.ReactNode; by: string; at: string; human?: boolean; reason?: string };
export function ActivityTimeline({ items = [] }: { items?: TimelineEntry[] }) {
  return <ol className="shx-tl">{items.map((it, i) => <li key={i} data-human={!!it.human}>{it.text}<small>{it.by} · <time>{it.at}</time>{it.reason ? " · reason: " + it.reason : ""}</small></li>)}</ol>;
}

export function ScoreComposition({ ai, aiWeight: aiWeightIn, rule, at, model, provider, configured }: {
  ai?: number | null; aiWeight?: number | null; rule: number; at?: string; model?: string | null; provider?: string | null; configured?: string;
}) {
  const aiWeight = aiWeightIn ?? 60;
  const rw = 100 - aiWeight;
  const metaBits = [configured && "Weights configured by " + configured, model && (provider ? model + " via " + provider : model), at && "scored " + at].filter(Boolean) as string[];
  if (ai == null) return <div className="shx-card"><div className="shx-row"><span>Rule checks only</span><span className="shx-sp" /><b className="shx-mono">{rule}</b></div><span className="shx-small">AI part missing · band not shown until rescored</span></div>;
  return (
    <div className="shx-card">
      <div className="shx-score" role="table" aria-label="Score composition">
        <span>AI assessment</span><span className="bar"><i style={{ width: ai + "%" }} /></span><b className="shx-mono">{ai} × {aiWeight}%</b>
        <span>Rule checks</span><span className="bar"><i style={{ width: rule + "%" }} /></span><b className="shx-mono">{rule} × {rw}%</b>
      </div>
      <span className="shx-small">{[...metaBits, "against the current criteria"].join(" · ")}</span>
    </div>
  );
}

export type CritResult = "meets" | "partial" | "not_met" | "unknown";
const CR: Record<CritResult, [string, string, string, string]> = {
  meets: ["✓", "var(--success)", "success", "Meets"], partial: ["◐", "var(--warning)", "warning", "Partial"],
  not_met: ["–", "var(--fg-2)", "neutral", "Not met"], unknown: ["?", "var(--muted)", "dashed", "Unknown"],
};
export function CriterionResult({ name, importance, result = "unknown", evidence, src, edited, onOverride, onRevert }: {
  name: string; importance?: string; result?: CritResult; evidence?: string; src?: string;
  edited?: { by: string; reason: string; ai: CritResult } | null; onOverride?: (v: CritResult) => void; onRevert?: () => void;
}) {
  const [g, c, tone, label] = CR[result];
  return (
    <div className="shx-crit">
      <span className="shx-crit__g" style={{ color: c }} aria-hidden="true">{g}</span>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <b style={{ fontWeight: 600 }}>{name}{importance && <span className="shx-small" style={{ fontWeight: 400 }}> · {importance}</span>}</b>
        <span className="shx-small">{evidence ? <>Evidence: <q>{evidence}</q>{src && <> · <a href="#" onClick={(e) => e.preventDefault()}>{src}</a></>}</> : "Not found in CV"}</span>
        {edited && (
          <span className="shx-edited"><Icon name="pencil" size={11} /><span>{"Edited by " + edited.by + " · " + edited.reason + " · AI said " + CR[edited.ai][3]}</span>
            {onRevert && <button type="button" className="sh-btn sh-btn--ghost sh-btn--sm" style={{ height: 20 }} onClick={onRevert}>Revert to AI</button>}
          </span>
        )}
      </div>
      <span className="shx-row" style={{ gap: 4 }}>
        <Badge tone={tone}>{label}</Badge>
        {onOverride && (
          <select aria-label={"Change result for " + name} value={result} onChange={(e) => onOverride(e.target.value as CritResult)} title="Override"
            style={{ font: "inherit", fontSize: 12, border: "1px solid var(--border-field)", borderRadius: 6, height: 24, background: "#fff", color: "var(--fg-2)", width: 24, padding: 0 }}>
            {(Object.keys(CR) as CritResult[]).map((k) => <option key={k} value={k}>{CR[k][3]}</option>)}
          </select>
        )}
      </span>
    </div>
  );
}

export function MatchStatusInline({ status, name, onRescore }: { status?: string; name?: string; onRescore?: () => void }) {
  if (status === "scoring") return <FileStatus status="processing" label="Scoring" />;
  if (status === "error") return (
    <span className="shx-row" style={{ gap: 6 }}>
      <span className="sh-chip sh-chip--danger"><Icon name="circle-x" size={12} />Scoring failed</span>
      {onRescore && <Button size="sm" variant="secondary" aria-label={"Rescore CV of " + name} onClick={(e) => { e.stopPropagation(); onRescore(); }}>Rescore</Button>}
    </span>
  );
  return <Badge tone="outline" icon="circle-dashed">Not scored</Badge>;
}

export function AIRationale({ text, lines = 3, model, provider, at }: { text: string; lines?: number; model?: string | null; provider?: string | null; at?: string }) {
  const [more, setMore] = React.useState(false);
  const meta: Record<string, string> = {};
  if (model) meta.Model = model;
  if (provider) meta.Provider = provider;
  if (at) meta.At = at;
  return (
    <div className="shx-rat">
      <div><AIBadge label="AI summary" title="Summary written by the model" meta={meta} /></div>
      <span style={more ? undefined : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{text}</span>
      <div className="shx-row">
        <span className="shx-small">May be wrong. Check against the original CV.</span><span className="shx-sp" />
        {text.length > 160 && <button type="button" className="sh-btn sh-btn--ghost sh-btn--sm" onClick={() => setMore(!more)}>{more ? "Show less" : "Show more"}</button>}
      </div>
    </div>
  );
}

export function HiddenScoreNotice({ submitted }: { submitted?: boolean }) {
  if (submitted) return null;
  return (
    <div className="shx-hidden" role="note">
      <Icon name="eye-off" size={16} style={{ color: "var(--muted)", marginTop: 2 }} />
      <span>The AI match is hidden until you submit your interview notes, so your assessment stays independent.</span>
    </div>
  );
}

/* ───────────────────────── sh-ext-flow ───────────────────────── */

type JobLike = { id: number; title: string; chapter: string; level: string; type: string; status: string; headcount: number; hired: number; deadline: string | null; daysLeft?: number; candidates: number; attention: number };
export function JobRow({ job: j, onOpen, onAttention }: { job: JobLike; onOpen?: () => void; onAttention?: () => void }) {
  const dl = j.daysLeft ?? 0;
  const risk = j.deadline && j.status === "Open" && dl <= 21 && j.hired < j.headcount;
  const over = j.status === "Open" && dl < 0;
  return (
    <div className="shx-card shx-card--i shx-jobcard" data-closed={j.status === "Closed"} role="link" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen && onOpen()}>
      <div className="shx-row">
        <b style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.title}</b>
        <Badge tone={j.type === "Internship" ? "info" : "outline"}>{j.type}</Badge><span className="shx-sp" />
        {over ? <Badge tone="danger" icon="clock">Overdue</Badge> : risk ? <Badge tone="warning" icon="clock">Due {j.deadline!.slice(0, 5)}</Badge> : j.deadline ? <span className="shx-small shx-mono">{j.deadline}</span> : <span className="shx-small">No deadline</span>}
      </div>
      <div className="shx-row"><span className="shx-small">#{j.id} · {j.chapter} · {j.level} · {j.status}</span><span className="shx-sp" /><span className="shx-small shx-mono">{j.hired}/{j.headcount} hired</span></div>
      <div className="shx-prog" role="progressbar" aria-valuemin={0} aria-valuemax={j.headcount} aria-valuenow={j.hired} aria-label={j.hired + " of " + j.headcount + " hired"}>
        <i style={{ width: (j.hired / j.headcount) * 100 + "%", background: "var(--z8-green-700)" }} />
      </div>
      <div className="shx-row">
        <span className="shx-small">{j.candidates} applications</span><span className="shx-sp" />
        {j.attention ? (
          <button type="button" className="jb-linkchip" onClick={(e) => { e.stopPropagation(); if (onAttention) onAttention(); }}><Badge tone="warning" icon="file-warning">{j.attention} to resolve</Badge></button>
        ) : <span className="shx-small">Nothing to resolve</span>}
      </div>
    </div>
  );
}

export function AIFilledField({ label, value, source, initial = "ai", multiline, readOnly, onCommit }: {
  label: string; value?: string; source?: string; initial?: "ai" | "edited" | "plain" | "missing"; multiline?: boolean; readOnly?: boolean;
  /** Called on blur with the new text when the user changed it. */
  onCommit?: (v: string) => void;
}) {
  const saved = React.useRef(value || "");
  const [state, setState] = React.useState(value ? initial : "missing");
  const [v, setV] = React.useState(value || "");
  const cls = "shx-aif" + (state === "ai" ? " shx-aif--ai" : state === "missing" ? " shx-aif--missing" : "");
  const common = {
    className: "shx-aif__box", value: v, readOnly, placeholder: state === "missing" ? "Not found in JD" : "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setV(e.target.value); setState("edited"); },
    onBlur: () => { if (onCommit && v !== saved.current) { saved.current = v; onCommit(v); } },
  };
  return (
    <div className={cls}>
      <label className="shx-aif__label">
        {label}
        {state === "ai" && <AIBadge unconfirmed meta={source ? { Source: source } : null} title="Filled from JD by AI" note="Review, and edit if needed, before the position opens." />}
        {state === "edited" && <span className="shx-edited"><Icon name="pencil" size={11} />Edited</span>}
      </label>
      {multiline ? <textarea rows={2} {...common} /> : <input {...common} />}
      {state === "ai" && source && <div className="shx-row" style={{ gap: 4 }}><span className="shx-sp" /><span className="shx-small">From {source}</span></div>}
    </div>
  );
}

const SENSITIVE = /(\bmale\b|\bfemale\b|under \d+|\bage\b|married|single|gender|nam,|nữ|tuổi)/i;
export function RequirementRow({ req, imp, origin, editable, onChange, onRemove }: {
  req: string; imp: string; origin: string; editable?: boolean; onChange?: (p: { req?: string; imp?: string }) => void; onRemove?: () => void;
}) {
  const warn = SENSITIVE.test(req);
  return (
    <div className={"shx-req" + (warn ? " shx-req--warn" : "")}>
      {editable ? <input className="jb-inline" value={req} onChange={(e) => onChange && onChange({ req: e.target.value })} aria-label="Criterion" /> : <span>{req}</span>}
      {editable ? <Select size="sm" value={imp} onChange={(e) => onChange && onChange({ imp: e.target.value })} options={["Must have", "Nice to have", "Bonus"]} aria-label="Importance" /> : <Badge tone={imp === "Must have" ? "brand" : "outline"}>{imp}</Badge>}
      <span>{origin === "AI" ? <AIBadge label="From JD" title="Extracted from the uploaded JD" meta={{ Source: "JD p.1 · Requirements" }} note="Confirm importance before the first CV is scored." /> : <Badge tone="outline" icon="user">Added by HR</Badge>}</span>
      <span>{editable && <button type="button" className="sh-iconbtn sh-iconbtn--sm" aria-label={"Remove criterion " + req} onClick={onRemove}><Icon name="trash-2" size={14} /></button>}</span>
      {warn && <div className="shx-req__warn" role="alert"><Icon name="triangle-alert" size={12} />May be discriminatory. Remove it or record a position-related reason.</div>}
    </div>
  );
}

export type Grant = { name: string; kind: string; role?: string; by: string; at: string; salary?: boolean; revocable?: boolean };
export function AccessGrantList({ grants = [], editable, onRevoke, footnote = "Admin and HR can always see every job." }: {
  grants?: Grant[]; editable?: boolean; onRevoke?: (g: Grant) => void; footnote?: string;
}) {
  return (
    <div className="shx-list">
      {grants.map((g) => (
        <div key={g.name} className="shx-li">
          {g.kind === "Chapter" ? <span className="jb-pool__icon" style={{ width: 28, height: 28 }}><Icon name="users" size={14} /></span> : <Avatar name={g.name} size={28} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="shx-row"><b style={{ fontWeight: 600 }}>{g.name}</b><Badge tone="outline">{g.kind}</Badge>{g.salary === false && <span className="shx-lock"><Icon name="lock" size={12} />Salary hidden</span>}</div>
            <span className="shx-small">{g.role ? g.role + " · " : ""}granted by {g.by} · {g.at}</span>
          </div>
          {editable && g.revocable && <Button size="sm" variant="danger-ghost" aria-label={"Revoke access of " + g.name} onClick={() => onRevoke && onRevoke(g)}>Revoke</Button>}
        </div>
      ))}
      <div className="shx-li" style={{ background: "var(--surface-subtle)" }}><Icon name="shield" size={14} style={{ color: "var(--muted)" }} /><span className="shx-small">{footnote}</span></div>
    </div>
  );
}

export function UploadQueuePanel({ total, processed, parsed, existing, attention, finished, collapsed, onToggle, onClose, children, footer }: {
  total: number; processed: number; parsed: number; existing: number; attention: number; finished?: boolean; collapsed?: boolean;
  onToggle?: () => void; onClose?: () => void; children?: React.ReactNode; footer?: React.ReactNode;
}) {
  const pct = (n: number) => (n / total) * 100 + "%";
  return (
    <div className="shx-queue" role="region" aria-label="Upload queue">
      <div className="shx-queue__h">
        <Icon name={finished ? "circle-check" : "loader-circle"} size={16} className={finished ? "" : "sh-spin"} style={{ color: finished ? "var(--success)" : "var(--info)" }} />
        <b style={{ fontWeight: 600, flex: 1 }}>{finished ? "Upload finished" : "Uploading"}</b>
        <button type="button" className="sh-btn sh-btn--ghost sh-btn--sm" onClick={onToggle}>{collapsed ? "Expand" : "Collapse"}<Icon name={collapsed ? "chevron-up" : "chevron-down"} size={14} /></button>
        {finished && <button type="button" className="sh-iconbtn sh-iconbtn--sm" aria-label="Close" onClick={onClose}><Icon name="x" size={14} /></button>}
      </div>
      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="shx-prog" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={processed} aria-valuetext={processed + " of " + total + " processed"}>
          <i style={{ width: pct(parsed), background: "var(--z8-green-700)" }} /><i style={{ width: pct(existing), background: "var(--info)" }} /><i style={{ width: pct(attention), background: "var(--warning)" }} />
        </div>
        <span className="shx-small">{processed}/{total} processed · {parsed} new · {existing} existing · {attention} need attention{finished ? "" : " · you can leave this page"}</span>
      </div>
      {!collapsed && children && <div style={{ borderTop: "1px solid var(--border)", maxHeight: 260, overflow: "auto" }}>{children}</div>}
      {footer && <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border)" }}>{footer}</div>}
    </div>
  );
}

export function FileStatusRow({ file, status, detail, actions = [], tech, admin }: {
  file: string; status: FileStatusKey; detail?: React.ReactNode; actions?: { label: string; onClick?: () => void }[]; tech?: string; admin?: boolean;
}) {
  return (
    <div className="shx-file">
      <div className="shx-row"><Icon name="file-text" size={14} style={{ color: "var(--muted)" }} /><span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file}</span><span className="shx-sp" /><FileStatus status={status} /></div>
      {detail && <span className="shx-small">{detail}</span>}
      {admin && tech && <details className="shx-small"><summary>Details</summary><span className="shx-mono">{tech}</span></details>}
      {actions.length > 0 && <div className="shx-row" style={{ gap: 4 }}>{actions.map((a, i) => <Button key={a.label} size="sm" variant={i ? "ghost" : "secondary"} onClick={a.onClick}>{a.label}</Button>)}</div>}
    </div>
  );
}

export function DuplicateCompareCard({ rows = [], onMerge, onNew }: { rows?: [string, string, string, boolean][]; onMerge?: () => void; onNew?: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="shx-cmp">
        <div /><div>Existing</div><div>New CV</div>
        {rows.map(([k, a, b, same]) => (
          <React.Fragment key={k}>
            <div className="shx-muted">{k}</div><div className={same ? "is-m" : ""}>{a}</div>
            <div className={same ? "is-m" : "is-d"}>{b}{same ? <Badge tone="success" icon="check">Match</Badge> : <Badge tone="warning">Differs</Badge>}</div>
          </React.Fragment>
        ))}
      </div>
      {(onMerge || onNew) && (
        <div className="shx-row">
          {onMerge && <Button size="sm" icon="git-merge" onClick={onMerge}>Merge into existing</Button>}
          {onNew && <Button size="sm" variant="secondary" onClick={onNew}>Create new…</Button>}
        </div>
      )}
    </div>
  );
}

export function KanbanColumn({ title, count, schedule, overdue = 0, groups = [], empty = "No candidates", style }: {
  title: string; count: number; schedule?: boolean; overdue?: number; groups?: { label: string; pass?: boolean; items: React.ReactNode[] }[]; empty?: string; style?: Style;
}) {
  return (
    <section className="shx-col" aria-label={title} style={style ?? undefined}>
      <header className="shx-col__h">
        <b style={{ fontWeight: 600 }}>{title}</b><span className="shx-cnt">{count}</span>
        {schedule && <Icon name="calendar" size={14} label="Scheduling allowed" style={{ color: "var(--muted)" }} />}<span className="shx-sp" />
        {overdue > 0 && <Badge tone="warning" icon="triangle-alert">{overdue} overdue</Badge>}
      </header>
      {groups.filter((g) => g.items.length).map((g) => (
        <React.Fragment key={g.label}><div className="shx-col__sub">{g.pass && <Icon name="check" size={11} />}{g.label} · {g.items.length}</div>{g.items}</React.Fragment>
      ))}
      {count === 0 && <div style={{ padding: 16, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>{empty}</div>}
    </section>
  );
}

export function KanbanCard({ name, headline, band, status, days, notes, lifted, onClick, onMove, hideScore, hired }: {
  name: string; headline?: string; band?: BandKey; status?: string; days: number; notes?: number; lifted?: boolean;
  onClick?: () => void; onMove?: () => void; hideScore?: boolean; hired?: boolean;
}) {
  return (
    <div className="shx-kcard" data-lifted={!!lifted} onClick={onClick} tabIndex={0}
      onKeyDown={(e) => { if (e.key === "m" || e.key === "M") { e.preventDefault(); if (onMove) onMove(); } if (e.key === "Enter" && onClick) onClick(); }}>
      <div className="shx-row">
        <b style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</b>{hired && <IdentityTag kind="hired" />}
        <button type="button" className="sh-iconbtn sh-iconbtn--sm" aria-label={"Move " + name + " (M)"} onClick={(e) => { e.stopPropagation(); if (onMove) onMove(); }}><Icon name="arrow-right-left" size={14} /></button>
      </div>
      {headline && <span className="shx-small" style={{ marginTop: -4 }}>{headline}</span>}
      <div className="shx-row">
        {hideScore ? <span className="shx-lock"><Icon name="eye-off" size={12} />Hidden</span> : status && status !== "done" ? <MatchStatusInline status={status} /> : band && <MatchBand band={band} compact />}
        <span className="shx-sp" />
        {!!notes && notes > 0 && <span className="shx-small" style={{ display: "inline-flex", gap: 3, alignItems: "center" }}><Icon name="message-square" size={12} />{notes}</span>}
        <span className="shx-small" style={days > 7 ? { color: "var(--warning)", fontWeight: 600 } : undefined}>{days}d</span>
      </div>
    </div>
  );
}

export type MoveItem = "-" | { heading: string } | { label: string; icon?: string; danger?: boolean; disabled?: boolean; note?: string; shortcut?: string; onClick?: () => void };
export function MoveToMenu({ items = [] }: { items?: MoveItem[] }) {
  return (
    <div className="shx-menu" role="menu">
      {items.map((it, i) => it === "-" ? <div key={i} className="shx-menu__sep" /> : "heading" in it ? <div key={i} className="shx-menu__h">{it.heading}</div> : (
        <button key={i} type="button" role="menuitem" className={"shx-menu__o" + (it.danger ? " shx-menu__o--danger" : "")} disabled={it.disabled} aria-disabled={it.disabled} onClick={it.onClick}>
          <Icon name={it.icon || "arrow-right"} size={14} style={{ marginTop: 2, color: it.danger ? "var(--danger)" : "var(--muted)" }} />
          <span>{it.label}{it.note && <small>{it.note}</small>}</span>{it.shortcut ? <kbd className="sh-kbd">{it.shortcut}</kbd> : <span />}
        </button>
      ))}
    </div>
  );
}

export function HireConfirmDialog({ name, detail, onClose, onConfirm, children }: { name: string; detail?: string; onClose: () => void; onConfirm: () => void; children?: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const b = ref.current?.querySelector(".sh-dialog");
    (b?.querySelector("[data-cancel]") as HTMLElement | null)?.focus();
  }, []);
  return (
    <div className="shx-dlg-accent" ref={ref}>
      <Dialog title={"Confirm " + name + " as hired?"} description={"The hired date is recorded once and cannot be changed. " + (detail || "")} onClose={onClose}
        footer={<><Button variant="secondary" data-cancel onClick={onClose}>Cancel</Button><Button icon="check" onClick={onConfirm}>Confirm hire</Button></>}>
        {children}
      </Dialog>
    </div>
  );
}

export function ShareEvaluationDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const [links, setLinks] = React.useState([{ id: 1, created: "24/09", exp: "24/10", state: "active" }, { id: 2, created: "01/09", exp: "01/10", state: "revoked" }]);
  const [exp, setExp] = React.useState("7 days");
  const [copied, setCopied] = React.useState<number | false>(false);
  return (
    <Dialog title="Share evaluation" description={name + " · link opens a watermarked PDF outside SmartHire access rules."} width={560} onClose={onClose}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button icon="link" onClick={() => setLinks((l) => [{ id: Date.now(), created: "29/09", exp: exp === "7 days" ? "06/10" : exp === "14 days" ? "13/10" : "29/10", state: "active" }, ...l])}>Create link</Button>
      </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="jb-form" style={{ paddingTop: 0 }}>
          <Select label="Expires in (required)" value={exp} onChange={(e) => setExp(e.target.value)} options={["7 days", "14 days", "30 days (max)"]} />
          <Input label="Recipient (optional)" placeholder="name@client.com" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="sh-field__label">Include</span>
          <Checkbox checked label="Match band & criteria" /><Checkbox checked={false} label="Contact details" /><Checkbox checked={false} label="Expected salary" />
        </div>
        <div>
          <div className="jb-overline" style={{ marginBottom: 6 }}>Links</div>
          <div className="shx-list">
            {links.map((l) => (
              <div key={l.id} className="shx-li">
                <div style={{ flex: 1 }}><b style={{ fontWeight: 600 }}>{l.state === "active" ? "Active link" : "Revoked link"}</b><div className="shx-small">Created {l.created} · {l.state === "active" ? "expires " + l.exp : "revoked"}</div></div>
                {l.state === "active" ? (
                  <>
                    <Button size="sm" variant="ghost" icon={copied === l.id ? "check" : "copy"} onClick={() => { setCopied(l.id); setTimeout(() => setCopied(false), 1500); }}>{copied === l.id ? "Copied" : "Copy"}</Button>
                    <Button size="sm" variant="danger-ghost" onClick={() => setLinks((ls) => ls.map((x) => (x.id === l.id ? { ...x, state: "revoked" } : x)))}>Revoke</Button>
                  </>
                ) : <Badge tone="neutral">Revoked</Badge>}
              </div>
            ))}
          </div>
          <div className="shx-small" style={{ marginTop: 6 }} aria-live="polite">{copied ? "Link copied to clipboard." : "Open counts are not tracked yet."}</div>
        </div>
      </div>
    </Dialog>
  );
}

export function InterviewNoteEditor({ round = "Interview 1", initial = "", submitted, onSubmit, quote }: { round?: string; initial?: string; submitted?: boolean; onSubmit?: (v: string) => void; quote?: { text: string; n: number } | null }) {
  const [v, setV] = React.useState(initial);
  const lastQ = React.useRef(0);
  React.useEffect(() => {
    if (!quote || quote.n === lastQ.current) return;
    lastQ.current = quote.n;
    setV((cur) => (cur ? cur + "\n" : "") + "> " + quote.text + "\n");
  }, [quote]);
  const [saved, setSaved] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!v || submitted) return;
    const t = setTimeout(() => setSaved(new Date().toTimeString().slice(0, 5)), 700);
    return () => clearTimeout(t);
  }, [v, submitted]);
  return (
    <div className="shx-note">
      <label className="sh-field__label" htmlFor="ivnote">Interview notes · {round}</label>
      <textarea id="ivnote" value={v} readOnly={submitted} onChange={(e) => setV(e.target.value)} placeholder="Strengths, concerns, and a recommendation for this round" />
      <div className="shx-row">
        <span className="shx-small" aria-live="polite">{submitted ? "Submitted · only you can edit" : saved ? "Draft saved " + saved : "Drafts save automatically"}</span><span className="shx-sp" />
        {!submitted && <Button size="sm" disabled={!v.trim()} onClick={() => onSubmit && onSubmit(v)}>Submit notes</Button>}
      </div>
    </div>
  );
}

/* ───────────────────────── storage helpers ───────────────────────── */

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
export function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}
