"use client";

import * as React from "react";
import { JD, type Job, type Role, type Stage } from "./data";
import { StageChip } from "./shell";
import { AccessGrantList, AIFilledField, Badge, Banner, Button, Card, Checkbox, Dialog, FileStatus, Icon, Input, Radio, RequirementRow, Select, Switch, type Grant } from "./ext";

export function Group({ title, open: o0, children, count }: { title: string; open?: boolean; children?: React.ReactNode; count?: string }) {
  const [open, setOpen] = React.useState(!!o0);
  return (
    <section className="jb-group">
      <button type="button" className="jb-group__head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={open ? "chevron-down" : "chevron-right"} size={16} /><b>{title}</b>
        {count && <span style={{ color: "var(--muted)", fontSize: 12 }}>{count}</span>}
      </button>
      {open && <div className="jb-group__body">{children}</div>}
    </section>
  );
}

// [label, value, source, wide]
type Field = [string, string, string | null, 1?];
type FieldGroup = [string, boolean, Field[]];

const JD_FIELDS: FieldGroup[] = [
  ["Position", false, [["Title", "Senior Web Developer", "JD p.1"], ["Level", "Senior", "JD p.1"], ["Hire type", "Full-time", "JD p.1"], ["Headcount", "2", null], ["Hiring deadline", "10/10/2026", null], ["Work location", "Hà Nội · hybrid", "JD p.1"]]],
  ["Requirements", true, [["Must-have", "3+ years React, TypeScript; shipped a large SPA", "JD p.1", 1], ["Nice-to-have", "GraphQL, fintech domain, Next.js", "JD p.2", 1], ["Languages", "English — client meetings", "JD p.2"], ["Education", "", null]]],
  ["Project & team", false, [["Project", "Merchant payments dashboard (JP client)", "JD p.2", 1], ["Team size", "8", "JD p.2"], ["Chapter", "Web", null]]],
  ["Compensation & benefits", false, [["Salary range", "35,000,000 – 50,000,000 VND", "JD p.3"], ["Probation", "2 months", "JD p.3"], ["Benefits", "13th-month salary, health insurance", "JD p.3", 1]]],
];
const NEW_FIELDS: FieldGroup[] = [
  ["Position", true, [["Title", "Cloud Engineer (AWS)", "JD p.1"], ["Level", "Mid–Senior", "JD p.1"], ["Hire type", "Full-time", null], ["Headcount", "1", "JD p.1"], ["Hiring deadline", "", null], ["Work location", "Hà Nội · onsite 3 days", "JD p.1"]]],
  ["Requirements", true, [["Must-have", "3+ years AWS (EC2, ECS, RDS); Terraform; CI/CD pipelines", "JD p.1", 1], ["Nice-to-have", "Kubernetes, AWS certification, Japanese client experience", "JD p.2", 1], ["Languages", "English — reading documentation", "JD p.2"], ["Education", "", null]]],
  ["Project & team", false, [["Project", "Platform migration for a JP retail client", "JD p.2", 1], ["Team size", "", null], ["Chapter", "Infra", null]]],
  ["Compensation & benefits", false, [["Salary range", "30,000,000 – 45,000,000 VND", "JD p.3"], ["Probation", "2 months", "JD p.3"], ["Benefits", "Certification budget, 13th-month salary", "JD p.3", 1]]],
];

function JdSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }} aria-hidden="true">
      {["Position", "Requirements", "Project & team", "Compensation & benefits"].map((g) => (
        <div key={g} className="jb-group" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <b style={{ fontWeight: 600, fontSize: 14, color: "var(--muted)" }}>{g}</b>
          <div className="jb-form" style={{ paddingTop: 0 }}>
            {[1, 2].map((i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}><span className="jb-skel" style={{ width: 80, height: 10 }} /><span className="jb-skel" style={{ height: 32 }} /></div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const PROC: [string, string, string][] = [
  ["upload", "Uploading JD file", "Stored securely; not shared outside SmartHire"],
  ["extract", "Extracting text from document", "Reads PDF/DOCX text; scanned pages use OCR"],
  ["llm", "AI filling position fields and criteria", "gpt-4.1 via Azure OpenAI · about 25 fields"],
  ["done", "Ready for your review", "Nothing is published until you open the position"],
];
function JdProcessing({ job }: { job: Job }) {
  const i = PROC.findIndex((p) => p[0] === job.processing);
  return (
    <div className="shx-card" style={{ padding: 16, gap: 12 }}>
      <div className="shx-row"><Icon name="file-text" size={16} style={{ color: "var(--muted)" }} /><b style={{ fontWeight: 600 }}>{job.file}</b><span className="shx-small">214 KB</span><span className="shx-sp" /><FileStatus status="processing" label="Processing JD" /></div>
      <ol className="jb-proc">
        {PROC.map(([k, l, s], j) => (
          <li key={k} className={j < i ? "is-done" : j === i ? "is-cur" : ""}>
            <span>{j < i ? <Icon name="check" size={12} /> : j === i ? <Icon name="loader-circle" size={12} className="sh-spin" /> : j + 1}</span>
            <div><b>{l}</b><small>{s}</small></div>
          </li>
        ))}
      </ol>
      <div className="shx-small">You can leave this page. You&apos;ll get a notification when the draft is ready.</div>
    </div>
  );
}

function HeadcountInput({ job, readOnly, ai, onChange }: { job: Job; readOnly?: boolean; ai?: boolean; onChange?: (n: number) => void }) {
  const [v, setV] = React.useState(String(job.headcount));
  const [touched, setTouched] = React.useState(false);
  const [prev, setPrev] = React.useState(job.headcount);
  if (prev !== job.headcount) { setPrev(job.headcount); setV(String(job.headcount)); }
  const n = Number(v);
  const err = !Number.isInteger(n) || n < 1 ? "Enter a whole number, 1 or more" : n < job.hired ? job.hired + " already hired — can’t be lower" : n > 50 ? "Maximum 50" : undefined;
  return (
    <Input
      label="Headcount" type="number" min={Math.max(1, job.hired)} max={50} step={1} value={v} readOnly={readOnly} ai={ai && !touched} suffix="people" error={err}
      hint={err ? undefined : job.hired + " hired · " + (n - job.hired) + " open"}
      onChange={(e) => {
        setV(e.target.value); setTouched(true);
        const x = Number(e.target.value);
        if (Number.isInteger(x) && x >= Math.max(1, job.hired) && x <= 50 && onChange) onChange(x);
      }}
    />
  );
}

export function JdFields({ ai, readOnly, fields = JD_FIELDS, blank, job, onHeadcount }: {
  ai?: boolean; readOnly?: boolean; fields?: FieldGroup[]; blank?: boolean; job?: Job; onHeadcount?: (n: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {fields.map(([g, open, fs]) => (
        <Group key={g} title={g} open={open} count={fs.length + " fields"}>
          <div className="jb-form">
            {fs.map(([l, v, src, wide]) => (
              <div key={l} style={wide ? { gridColumn: "1/-1" } : undefined}>
                {l === "Headcount" && job
                  ? <HeadcountInput job={job} readOnly={readOnly} ai={ai && !!src && !blank} onChange={onHeadcount} />
                  : <AIFilledField label={l} value={blank ? "" : v} source={blank || !src ? undefined : src} multiline={!!wide} readOnly={readOnly} initial={ai && src ? "ai" : "confirmed"} />}
              </div>
            ))}
          </div>
        </Group>
      ))}
    </div>
  );
}

export type Crit = { id: string; req: string; imp: string; origin: string };

export function CriteriaEditor({ crit, setCrit, canEdit, scored, onRescore }: {
  crit: Crit[]; setCrit: React.Dispatch<React.SetStateAction<Crit[]>>; canEdit?: boolean; scored: number; onRescore?: () => void;
}) {
  const [dirty, setDirty] = React.useState(false);
  const upd = (id: string, p: Partial<Crit>) => { setCrit((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c))); setDirty(true); };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {dirty && scored > 0 && (
        <Banner tone="warning" title="Scores use the previous criteria" action={<Button size="sm" variant="secondary" icon="rotate-ccw" onClick={() => { setDirty(false); if (onRescore) onRescore(); }}>Rescore {scored}</Button>}>
          {scored} candidates were scored before this change. Rescoring uses AI credits and replaces current bands; manual edits are kept.
        </Banner>
      )}
      <div className="shx-list">
        {crit.map((c) => (
          <RequirementRow key={c.id} req={c.req} imp={c.imp} origin={c.origin} editable={canEdit} onChange={(p) => upd(c.id, p)} onRemove={() => { setCrit((cs) => cs.filter((x) => x.id !== c.id)); setDirty(true); }} />
        ))}
      </div>
      {canEdit && (
        <div><Button size="sm" variant="ghost" icon="plus" onClick={() => { setCrit((cs) => [...cs, { id: "n" + Date.now(), req: "New criterion", imp: "Nice to have", origin: "HR" }]); setDirty(true); }}>Add criterion</Button></div>
      )}
    </div>
  );
}

const copyCrit = (job: Job): Crit[] => (job.criteria || JD.criteria).map((c) => ({ id: c.id, req: c.req, imp: c.imp, origin: c.origin }));

export function DescriptionTab({ job, user, onRescore, onHeadcount }: { job: Job; user: Role; onRescore?: () => void; onHeadcount?: (n: number) => void }) {
  const [crit, setCrit] = React.useState<Crit[]>(() => copyCrit(job));
  // Reload criteria once AI finishes extracting the JD.
  const [proc, setProc] = React.useState(job.processing);
  if (proc !== job.processing) { setProc(job.processing); if (job.criteria) setCrit(copyCrit(job)); }
  const canEdit = user.key === "hr" || user.key === "ch";
  const isNew = !!job.fresh;

  if (job.processing)
    return (
      <div className="jb-2col">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><h2 className="jb-h2">Job description</h2><JdProcessing job={job} /><JdSkeleton /></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 className="jb-h2">Scoring criteria</h2>
          <div className="shx-list">{[1, 2, 3, 4].map((i) => <div key={i} className="shx-li"><span className="jb-skel" style={{ flex: 1, height: 12 }} /><span className="jb-skel" style={{ width: 120, height: 24 }} /></div>)}</div>
          <span className="shx-small">Criteria appear when AI finishes reading the JD.</span>
        </div>
      </div>
    );

  return (
    <div className="jb-2col">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 className="jb-h2">Job description</h2><span style={{ flex: 1 }} />
          {!job.blank && <Button size="sm" variant="ghost" icon="file-text">{job.file || "JD_SeniorWeb_2026.pdf"}</Button>}
        </div>
        {isNew && !job.blank ? (
          <Banner tone="ai" title={"19 of 25 fields filled from " + job.file}>Violet fields are AI suggestions. Confirm or edit each one; 6 fields were not found in the JD. Nothing is visible to candidates or other chapters until you open the position.</Banner>
        ) : isNew ? (
          <Banner tone="info" icon="pencil" title="Blank position">Fill in the fields and add scoring criteria, then open the position.</Banner>
        ) : (
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Draft generated with AI assistance; reviewed by Nguyễn Thị Hiền on 10/09/2026.</div>
        )}
        <JdFields readOnly={!canEdit} ai={job.status === "Draft"} fields={isNew ? NEW_FIELDS : undefined} blank={job.blank} job={job} onHeadcount={onHeadcount} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, position: "sticky", top: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 className="jb-h2">Scoring criteria</h2><Badge tone="outline">{crit.length}</Badge><span style={{ flex: 1 }} />
          {job.status === "Draft" && (job.reviewRequested || job.id === 156) && <Badge tone="warning" icon="clock">Waiting for Chapter Head review</Badge>}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Rule checks use these criteria. AI weight 60% · rules 40%, set by HR on 12/09.</div>
        <CriteriaEditor crit={crit} setCrit={setCrit} canEdit={canEdit} scored={job.id === 142 ? 18 : 0} onRescore={onRescore} />
        {user.key === "ch" && (
          <Card title="Comment for HR">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <textarea className="jb-textarea" placeholder="e.g. GraphQL should be nice-to-have, not must-have" />
              <div><Button size="sm">Send comment</Button></div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

export function PipelineTab({ user }: { user: Role }) {
  const [stages, setStages] = React.useState<Stage[]>(() => JD.stages.map((s) => ({ ...s })));
  const edit = user.key === "hr";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 980 }}>
      <Banner tone="info" icon="route">A candidate moves forward only when the current step is marked with its passing result. New stages start at their default step. Going back is allowed only from the default step.</Banner>
      <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflowX: "auto" }}>
        <div className="jb-pipe jb-pipe--head"><span>#</span><span>Stage</span><span>Steps</span><span>Scheduling</span><span>Evaluation template</span></div>
        {stages.map((s, i) => (
          <div key={s.id} className="jb-pipe">
            <span className="sh-num" style={{ textAlign: "left", color: "var(--muted)" }}>{i + 1}</span>
            <span><StageChip stage={s.id} /></span>
            <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {s.subs.map((x) => <Badge key={x} tone={x === s.pass ? "success" : x === s.def ? "outline" : "neutral"} icon={x === s.pass ? "check" : x === s.def ? "flag" : undefined}>{x}</Badge>)}
            </span>
            <span><Switch checked={!!s.schedule} disabled={!edit} onChange={(v) => setStages((ss) => ss.map((x) => (x.id === s.id ? { ...x, schedule: v } : x)))} label={s.schedule ? "Allowed" : "Off"} /></span>
            <span style={{ fontSize: 13, color: s.template ? "var(--foreground)" : "var(--muted)" }}>{s.template || "None"}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--muted)" }}>
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Icon name="flag" size={12} />Default step</span>
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Icon name="check" size={12} />Passing step (unlocks next stage)</span>
        <span>Moving Offer → Probation records the hire and needs both confirmations (candidate accepted + company approved). Probation steps follow start date and the Chapter Head decision; Passed unlocks Official.</span>
      </div>
    </div>
  );
}

type AccessGrant = Grant & { primary?: boolean; cands?: number };
type Person = { name: string; title: string; chapter: string };
const PEOPLE: Person[] = [
  { name: "Lê Thanh Tùng", title: "Senior Recruiter", chapter: "HR" },
  { name: "Võ Thị Mai", title: "Recruiter", chapter: "HR" },
  { name: "Ngô Đức Hải", title: "Tech Lead", chapter: "Web" },
  { name: "Trương Minh Khoa", title: "Engineering Manager", chapter: "Web" },
];
type AddRole = "rc" | "rm";
type AddResult = { person: Person; role: AddRole; label: string; primary: boolean };

function AddPersonDialog({ existing, onClose, onAdd }: { existing: AccessGrant[]; onClose: () => void; onAdd: (o: AddResult) => void }) {
  const avail = PEOPLE.filter((p) => !existing.some((g) => g.name === p.name));
  const [who, setWho] = React.useState(avail[0]?.name || "");
  const [role, setRole] = React.useState<AddRole>("rc");
  const [primary, setPrimary] = React.useState(false);
  const person = avail.find((p) => p.name === who);
  const label = role === "rm" ? "Recruitment manager" : "Recruiter";
  return (
    <Dialog
      title="Add person to this position" description="They see candidates on this position only. Expected salary stays hidden unless they manage recruitment."
      onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!person} onClick={() => person && onAdd({ person, role, label, primary: role === "rm" && primary })}>Add {label.toLowerCase()}</Button></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {avail.length ? (
          <Select label="Person" value={who} onChange={(e) => setWho(e.target.value)} options={avail.map((p) => p.name)} />
        ) : (
          <Banner tone="neutral" icon="users">Everyone in the directory already has access.</Banner>
        )}
        {person && <span className="shx-small">{person.title} · {person.chapter}</span>}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }} role="radiogroup" aria-label="Role on this position">
          <Radio name="add-role" checked={role === "rc"} onChange={() => setRole("rc")} label="Recruiter — screens and moves candidates" />
          <Radio name="add-role" checked={role === "rm"} onChange={() => setRole("rm")} label="Recruitment manager — decides on hires, sees salary" />
        </div>
        {role === "rm" && <Checkbox checked={primary} onChange={(e) => setPrimary(e.target.checked)} label="Make primary (replaces the current primary manager)" />}
      </div>
    </Dialog>
  );
}

export function AccessTab({ user }: { user: Role }) {
  const A = JD.access;
  const [grants, setGrants] = React.useState<AccessGrant[]>(() => [
    ...A.chapters.map((c) => ({ name: "Chapter " + c.name, kind: "Chapter", role: c.members + " members", by: c.by, at: c.at })),
    ...A.people.map((p) => ({
      name: p.name,
      kind: p.via === "Chapter" ? "Recruitment manager" : p.via === "Direct" ? (p.role === "Recruiter" ? "Recruiter" : "Person") : "Interviewer",
      role: p.via === "Chapter" ? p.role + " · primary · via chapter" : p.via === "Interview schedule" ? p.role.replace("Interviewer · ", "") + " schedule" : undefined,
      primary: p.via === "Chapter", by: p.by, at: p.at, salary: p.salary, cands: p.cands, revocable: p.via === "Direct",
    })),
  ]);
  const [rm, setRm] = React.useState<AccessGrant | null>(null);
  const [add, setAdd] = React.useState(false);
  const onAdd = (o: AddResult) => {
    setGrants((g) => [
      ...(o.primary ? g.map((x) => (x.primary ? { ...x, primary: false, role: (x.role || "").replace(" · primary", "") } : x)) : g),
      { name: o.person.name, kind: o.label, role: o.person.title + " · " + o.person.chapter + (o.primary ? " · primary" : ""), primary: o.primary, by: user.name || "Nguyễn Thị Hiền", at: "02/10/2026", salary: o.role === "rm", cands: 34, revocable: true },
    ]);
    setAdd(false);
  };
  const canEdit = user.key === "hr" || user.key === "ch";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 820 }}>
      <div className="shx-row">
        <div className="jb-overline" style={{ flex: 1 }}>Who can see this position · {grants.length}</div>
        {canEdit && <><Button size="sm" variant="ghost" icon="plus">Add chapter</Button><Button size="sm" variant="ghost" icon="user-plus" onClick={() => setAdd(true)}>Add person</Button></>}
      </div>
      <AccessGrantList grants={grants} editable={canEdit} onRevoke={(g) => setRm(g as AccessGrant)} footnote="Admin and HR can always see every position. Admin access shows a banner and is written to the audit log." />
      {add && <AddPersonDialog existing={grants} onClose={() => setAdd(false)} onAdd={onAdd} />}
      {rm && (
        <Dialog
          title={"Revoke access of " + rm.name + "?"}
          description={rm.name + " will lose access to " + (rm.cands ?? 0) + " candidates' applications on this position. Notes they wrote stay on the candidates."}
          onClose={() => setRm(null)}
          footer={<><Button variant="secondary" onClick={() => setRm(null)}>Cancel</Button><Button variant="danger" onClick={() => { setGrants((g) => g.filter((x) => x.name !== rm.name)); setRm(null); }}>Revoke access</Button></>}
        >
          <div style={{ fontSize: 13, color: "var(--fg-2)" }}>This change is recorded in the audit log with your name.</div>
        </Dialog>
      )}
    </div>
  );
}
