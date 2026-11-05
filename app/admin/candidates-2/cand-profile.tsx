 
"use client";

import * as React from "react";
import {
  AIBadge, ApplicationRow, Badge, Banner, Button, Card, EntityTabs, FileStatus, Icon, LockChip, MatchBand, Menu,
} from "../position-management-2/ext";
import { ConsentCard, HistoryStrip, HistoryTab, ReasonCell, RehireCard, TalentCard, type Act } from "./cand-mvp";
import { ResultBadge } from "./cand-list";
import { cvDownloadUrl } from "./api";
import { canSeeApp, canSeeSalary, type Persona, type Person } from "./data";

function Field({ label, children, note }: { label: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>{children}{note}</dd>
    </>
  );
}

function Missing({ v }: { v: string }) {
  return v === "Not found in CV" ? <span className="shx-small" style={{ fontStyle: "italic" }}>Not found in CV</span> : <>{v}</>;
}

function Overview({ p, user, act }: { p: Person; user: Persona; act: Act }) {
  const u = user as any;
  const pp = p as any;
  const latest = ((p.cvs.find((c: any) => c.latest) || p.cvs[0]) ?? { file: "no CV", date: "—" }) as any;
  const ed = pp.edits?.exp;
  const hrEdit = u.allJobs && !u.admin;
  return (
    <div className="cd-grid">
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <Card title="Personal information" right={hrEdit && <Button size="sm" variant="ghost" icon="pencil" onClick={() => act("contact")}>Edit contact</Button>}>
          <dl className="jb-dl">
            <Field label="Full name">{p.name}</Field>
            <Field label="Email" note={<span className="shx-small">Used to match new CVs to this person</span>}>{p.email}</Field>
            <Field label="Phone"><span className="sh-num">{p.phone}</span></Field>
            <Field label="Date of birth">
              {u.allJobs ? <span className="sh-num"><Missing v={pp.dob} /></span> : <LockChip label="Restricted" reason="Only HR and Admin can see date of birth." />}
            </Field>
          </dl>
        </Card>
        <Card
          title="Professional information"
          right={<AIBadge label="From CV" title="Read from the latest CV" meta={{ File: latest.file, Parsed: latest.date, Model: "gpt-4.1", Provider: "Azure OpenAI" }} note="Fields refresh when a newer CV is parsed. Fields edited by a person are kept." />}
        >
          <span style={{ fontSize: 12, color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <Icon name="refresh-cw" size={12} /> Synced from {latest.file} · {latest.date}
          </span>
          {pp.conflict && hrEdit && (
            <div className="cd-conflict" role="note">
              <Icon name="git-compare" size={16} style={{ color: "var(--warning)" }} />
              <div style={{ flex: 1 }}>
                <b>Newer CV disagrees with an edited field</b>
                <div className="shx-small">Experience: you kept {pp.exp} years; {pp.conflict.file} says {pp.conflict.cv} years. Nothing was overwritten.</div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <Button size="sm" variant="secondary" onClick={() => act("keep")}>Keep {pp.exp} years</Button>
                  <Button size="sm" variant="ghost" onClick={() => act("usecv")}>Use CV value</Button>
                </div>
              </div>
            </div>
          )}
          <dl className="jb-dl">
            <Field label="Current role">{p.role} · {pp.company}</Field>
            <Field
              label="Experience"
              note={ed && (
                <span className="shx-edited">
                  <Icon name="pencil" size={11} /> Edited by {ed.by} · {ed.reason} · AI said {ed.ai} years
                  {hrEdit && <button type="button" className="sh-btn sh-btn--ghost sh-btn--sm" style={{ height: 20 }} onClick={() => act("revert")}>Revert to AI</button>}
                </span>
              )}
            >
              <span className="sh-num">{pp.exp} years</span>
            </Field>
            <Field label="Skills"><span className="jb-chips">{p.skills.map((s) => <Badge key={s} tone="outline">{s}</Badge>)}</span></Field>
            <Field label="Degree"><Missing v={pp.degree} /></Field>
            <Field label="Education"><Missing v={pp.education} /></Field>
            <Field label="English"><Missing v={pp.english} /></Field>
          </dl>
        </Card>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <RehireCard p={p} user={user} act={act} />
        <TalentCard p={p} user={user} act={act} />
        <Card title="Applications" right={<Button size="sm" variant="ghost" onClick={() => act("tab", "apps")}>View all {p.apps.length}</Button>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {p.apps.slice(0, 3).map((a: any, i: number) =>
              canSeeApp(user, a) ? (
                <ApplicationRow
                  key={i}
                  job={a.title + (a.job ? " #" + a.job : "")}
                  date={a.date}
                  stage={a.result === "pool" ? a.from : <StageChip stage={a.stage} sub={a.sub} />}
                  band={u.hideScore ? null : a.band}
                  score={a.score}
                  status={a.result}
                  onClick={a.job ? () => act("openApp", a) : undefined}
                />
              ) : (
                <div key={i} className="shx-card" style={{ background: "var(--surface-subtle)", padding: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div className="shx-row" style={{ gap: 6 }}>
                    <Icon name="lock" size={12} style={{ color: "var(--muted)" }} />
                    <b>{a.title}</b>
                    <span className="shx-sp" />
                    <ResultBadge a={a} />
                  </div>
                  <span className="shx-small">{a.date} · Position in chapter {a.chapter} · details not shared with you</span>
                </div>
              ),
            )}
          </div>
        </Card>
        <Card title="Record">
          <dl className="jb-dl" style={{ gridTemplateColumns: "120px 1fr" }}>
            <Field label="First seen"><span className="sh-num">{pp.created}</span></Field>
            <Field label="Source">{pp.source}</Field>
            <Field label="CV files">
              {p.cvs.length} file{p.cvs.length === 1 ? "" : "s"} · <a href="#" onClick={(e) => { e.preventDefault(); act("tab", "cvs"); }}>View</a>
            </Field>
            <Field label="Last updated">{p.updated}</Field>
          </dl>
        </Card>
        <ConsentCard p={p} user={user} act={act} />
      </div>
    </div>
  );
}

function CVsTab({ p, user, act }: { p: Person; user: Persona; act: Act }) {
  const u = user as any;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 980 }}>
      <div className="shx-row" style={{ gap: 8 }}>
        <span className="shx-small">Each application keeps its own CV versions. This list gathers every file from {p.apps.length} application{p.apps.length === 1 ? "" : "s"}; the same file used twice is shown once.</span>
        <span className="shx-sp" />
        {u.key !== "iv" && <Button size="sm" variant="secondary" icon="upload" onClick={() => act("upload")}>Upload CV</Button>}
      </div>
      {p.cvs.map((f: any) => {
        const failed = !!f.error;
        const multi = (f.uses || []).filter((x: any) => x.v).length;
        return (
          <section key={f.id} className="cd-file" data-failed={failed ? "true" : undefined}>
            <div className="cd-file__h">
              <span className="jb-att__ic" style={{ background: failed ? "var(--warning-soft)" : "var(--surface-subtle)", color: failed ? "var(--warning)" : "var(--fg-2)", border: "1px solid var(--border)" }}>
                <Icon name={failed ? "file-warning" : "file-text"} size={16} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="shx-row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <b>{f.file}</b>
                  {f.latest && <Badge tone="brand" icon="star">Latest</Badge>}
                  {failed && <FileStatus status="unreadable" />}
                  {multi > 1 && <Badge tone="outline" icon="copy">Same file · {multi} uses</Badge>}
                </div>
                <span className="shx-small">Uploaded {f.date} by {f.by} · {f.batch} · source: {f.source}</span>
              </div>
              <Button variant="ghost" size="sm" icon="eye" onClick={() => (p.uuid ? window.open(cvDownloadUrl(p.uuid, f.id), "_blank", "noopener") : act("say", "Opening " + f.file))}>View file</Button>
              {f.latest && p.cvs.length > 1 && <Button variant="secondary" size="sm" icon="git-compare" onClick={() => act("compare")}>Compare CVs</Button>}
            </div>
            {f.error && <div style={{ padding: 12 }}><Banner tone="warning" icon="file-warning">{f.error}</Banner></div>}
            {f.change && (
              <div className="cd-file__chg">
                <AIBadge label="What changed" title="Change summary written by the model" meta={{ Compared: "with TranMinhBao_CV_2025.pdf", Model: "gpt-4.1" }} />
                <span>{f.change}</span>
              </div>
            )}
            <div className="cd-uses">
              <div className="cd-uses__h"><span>Used in</span><span>Version</span><span>Status</span></div>
              {(f.uses || []).map((x: any, i: number) => {
                const a = p.apps.find((q: any) => q.id === x.app) as any;
                const ok = a && canSeeApp(user, a);
                return (
                  <div key={i} className="cd-uses__r">
                    <span className="shx-row" style={{ gap: 6 }}>
                      {!ok && <Icon name="lock" size={12} style={{ color: "var(--muted)" }} />}
                      {ok && a.job ? <a href="#" onClick={(e) => { e.preventDefault(); act("openApp", a); }}>{a.title} #{a.job}</a> : <span>{a ? a.title : "—"}</span>}
                      <span className="shx-small">{a?.date}</span>
                    </span>
                    <span className="shx-mono" style={{ fontSize: 12 }}>{x.v ? "v" + x.v : "—"}</span>
                    {x.inUse ? <Badge tone="success" icon="check">In use</Badge> : <span className="shx-small">{x.note}</span>}
                  </div>
                );
              })}
            </div>
            <footer className="cd-file__f"><Icon name="link-2" size={12} /> Linked to this candidate by: {f.matched}</footer>
          </section>
        );
      })}
    </div>
  );
}

function AppsTab({ p, user, act }: { p: Person; user: Persona; act: Act }) {
  const u = user as any;
  const hidden = p.apps.filter((a) => !canSeeApp(user, a)).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {hidden > 0 && <Banner tone="neutral" icon="lock">{hidden} application{hidden === 1 ? " is" : "s are"} in a position you can’t open. Only the date, position and result are shown.</Banner>}
      <div className="sh-table-wrap">
        <table className="sh-table">
          <thead>
            <tr>
              <th>Position</th><th>Added</th><th>Last stage</th><th>Result</th><th>Why it ended</th>
              {!u.hideScore && <th title="Scored against that position’s criteria. Not comparable across positions.">AI match <Icon name="info" size={12} /></th>}
              <th>Activity</th><th>Expected salary</th><th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {p.apps.map((a: any, i: number) => {
              const ok = canSeeApp(user, a);
              const link = ok && a.job;
              const act2 = [a.iv && a.iv + " interview" + (a.iv > 1 ? "s" : ""), a.notes && a.notes + " note" + (a.notes > 1 ? "s" : ""), a.evals && a.evals + " evaluation" + (a.evals > 1 ? "s" : "")].filter(Boolean).join(" · ");
              return (
                <tr key={i} onClick={link ? () => act("openApp", a) : undefined} style={{ cursor: link ? "pointer" : undefined }}>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span className="shx-row" style={{ gap: 6, fontWeight: 600 }}>{!ok && <Icon name="lock" size={12} style={{ color: "var(--muted)" }} />}{a.title}</span>
                      <span className="shx-small">{a.job ? "#" + a.job + " · " + a.chapter + (a.jobStatus === "Closed" ? " · position closed" : "") : a.from}</span>
                    </div>
                  </td>
                  <td><span className="sh-num">{a.date}</span></td>
                  <td>{!ok || a.result === "pool" ? "—" : <StageChip stage={a.stage} sub={a.sub} />}</td>
                  <td><ResultBadge a={a} /></td>
                  <td>{ok ? <ReasonCell a={a} user={user} act={act} /> : "—"}</td>
                  {!u.hideScore && (
                    <td>
                      {!ok || a.result === "pool" ? "—" : (
                        <span className="shx-row" style={{ gap: 6 }}>
                          {a.scoreErr ? <span className="sh-chip sh-chip--danger"><Icon name="circle-x" size={12} /> Scoring failed</span>
                            : a.scoring ? <FileStatus status="processing" label="Scoring" /> : <MatchBand band={a.band} score={a.score} />}
                          {!a.scoring && (
                            <Button variant="ghost" size="sm" icon="refresh-cw" aria-label={"Re-score " + a.title} title="Re-run the AI match against the current criteria"
                              onClick={(e: React.MouseEvent) => { e.stopPropagation(); act("rescore", a); }} />
                          )}
                        </span>
                      )}
                    </td>
                  )}
                  <td>{ok ? act2 || "No activity yet" : "—"}</td>
                  <td>
                    {!a.salary ? "—" : canSeeSalary(user, a) ? <span className="sh-num">{a.salary}</span>
                      : <LockChip label="Restricted" reason="Only HR, Admin and the position’s Chapter Head can see expected salary." />}
                  </td>
                  <td>{link && <Icon name="arrow-up-right" size={16} style={{ color: "var(--accent)" }} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <span className="shx-small">Stage changes, notes and evaluations are managed inside each position. Every ended application needs a reason category so it can be reported on and shown when the person applies again.</span>
    </div>
  );
}

function StageChip({ stage, sub }: { stage: string; sub: string }) {
  return <Badge tone="outline">{stage + " - " + sub}</Badge>;
}

function Pop({ open, onClose, top, width, children }: { open: boolean; onClose: () => void; top: number; width: number; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open, onClose]);
  if (!open) return null;
  return <div ref={ref} style={{ position: "absolute", right: 0, top, width, zIndex: 50 }}>{children}</div>;
}

export function ProfileMoreMenu({ user: _user, act }: { user: Persona; act: Act }) {
  const [open, setOpen] = React.useState(false);
  const go = (k: string) => () => { setOpen(false); act(k); };
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <Button variant="secondary" icon="ellipsis" aria-label="More actions" onClick={() => setOpen((o) => !o)}>More</Button>
      <Pop open={open} onClose={() => setOpen(false)} top={42} width={230}>
        <Menu items={[
          { label: "Merge with…", icon: "git-merge", onClick: go("merge") },
          { label: "Export profile", icon: "download", onClick: go("export") },
          "-",
          { label: "Delete or anonymize…", icon: "trash-2", danger: true, onClick: go("delete") },
        ]} />
      </Pop>
    </span>
  );
}

export function CandidateProfile({ p, user, tab, setTab, act, people }: {
  p: Person; user: Persona; tab: string; setTab: (t: string) => void; act: Act; people: Person[];
}) {
  const u = user as any;
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "history", label: "History" },
    { id: "cvs", label: "CVs", count: p.cvs.length },
    { id: "apps", label: "Applications", count: p.apps.length },
  ];
  const dupOf = (p as any).dupOf;
  const dup: any = dupOf && u.allJobs ? people.find((x) => x.id === dupOf) : null;
  return (
    <div style={{ padding: "0 0 32px", display: "flex", flexDirection: "column", gap: 16 }}>
      {u.admin && <Banner tone="warning" icon="shield" title="Admin access">This view is recorded in the audit log.</Banner>}
      {dup && (
        <Banner
          tone="warning" icon="users" title="Possible duplicate"
          action={<>
            <Button size="sm" variant="secondary" icon="git-merge" onClick={() => act("merge")}>Compare and merge</Button>
            <Button size="sm" variant="ghost" onClick={() => act("open", dup.id)}>Open other record</Button>
            <Button size="sm" variant="ghost" onClick={() => act("notdup")}>Not the same person</Button>
          </>}
        >
          Same email as {dup.name} (first seen {dup.created}); phone number differs. Records were not merged automatically.
        </Banner>
      )}
      <HistoryStrip p={p} user={user} />
      <EntityTabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "history" && <HistoryTab p={p} user={user} act={act} />}
      {tab === "overview" && <Overview p={p} user={user} act={act} />}
      {tab === "cvs" && <CVsTab p={p} user={user} act={act} />}
      {tab === "apps" && <AppsTab p={p} user={user} act={act} />}
    </div>
  );
}
