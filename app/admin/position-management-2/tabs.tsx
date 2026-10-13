"use client";

import * as React from "react";
import { STAGES, type Job, type Role, type Stage } from "./data";
import { StageChip } from "./shell";
import { changeAccess, fetchAccess, type AccessDirectoryPerson, type AccessGrantDto, type PositionAccess } from "./api";
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

// [label, value, source, wide, editable detail key]
type DetailKey = keyof NonNullable<Job["details"]>;
type Field = [string, string, string | null, (0 | 1)?, DetailKey?];
type FieldGroup = [string, boolean, Field[]];

/** Builds the field groups from the real position. Education and Probation have no backing column yet. */
function jobFields(job?: Job): FieldGroup[] {
  const d = job?.details;
  const jd = job?.file ? "JD" : null;
  const chapter = job?.chapters?.length ? job.chapters.join(", ") : job && job.chapter !== "—" ? job.chapter : "";
  return [
    ["Position", true, [["Title", job?.title ?? "", null], ["Level", job && job.level !== "—" ? job.level : "", null], ["Hire type", job?.type ?? "", null], ["Hiring deadline", job?.deadline ?? "", null], ["Reporting to", d?.reporting ?? "", jd, 0, "reporting"], ["Work location", d?.workLocation ?? "", jd, 0, "workLocation"], ["Chapter", chapter, null]]],
    ["Requirements", true, [["Must-have", d?.mustHave ?? "", jd, 1, "mustHave"], ["Nice-to-have", d?.niceToHave ?? "", jd, 1, "niceToHave"], ["Languages", d?.languages ?? "", jd, 0, "languages"]]],
    ["Project & team", true, [["Project", d?.project ?? "", jd, 1, "project"], ["Team size", d?.teamSize ?? "", jd, 0, "teamSize"]]],
    ["Compensation & benefits", false, [["Salary range", d?.salaryRange ?? "", jd, 0, "salaryRange"], ["Benefits", d?.benefits ?? "", jd, 1, "benefits"]]],
  ];
}

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
      <div className="shx-row"><Icon name="file-text" size={16} style={{ color: "var(--muted)" }} /><b style={{ fontWeight: 600 }}>{job.file}</b><span className="shx-sp" /><FileStatus status="processing" label="Processing JD" /></div>
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

export function JdFields({ ai, readOnly, fields, blank, job, onDetail }: {
  ai?: boolean; readOnly?: boolean; fields?: FieldGroup[]; blank?: boolean; job?: Job; onDetail?: (key: DetailKey, value: string) => void
}) {
  const groups = fields ?? jobFields(job);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {groups.map(([g, open, fs]) => (
        <Group key={g} title={g} open={open} count={fs.length + " fields"}>
          <div className="jb-form">
            {fs.map(([l, v, src, wide, key]) => (
              <div key={l} style={wide ? { gridColumn: "1/-1" } : undefined}>
                <AIFilledField key={`${l}:${job?.details !== undefined}`} label={l} value={blank ? "" : v} source={blank || !src ? undefined : src} multiline={!!wide} initial={ai && src ? "ai" : "plain"} readOnly={readOnly || !key} onCommit={key && onDetail ? (x) => onDetail(key, x) : undefined} />
              </div>
            ))}
          </div>
        </Group>
      ))}
    </div>
  );
}

export type Crit = { id: string; req: string; imp: string; origin: string };

export function CriteriaEditor({ crit, setCrit, canEdit, onSave, onRescore }: {
  crit: Crit[]; setCrit: React.Dispatch<React.SetStateAction<Crit[]>>; canEdit?: boolean;
  /** Persists the list; resolves with how many scored candidates are now stale. */
  onSave?: (crit: Crit[]) => Promise<number>; onRescore?: () => Promise<void> | void;
}) {
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [stale, setStale] = React.useState(0);
  const upd = (id: string, p: Partial<Crit>) => { setCrit((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c))); setDirty(true); };
  const save = async () => {
    if (!onSave) return;
    setBusy(true);
    try { setStale(await onSave(crit)); setDirty(false); } catch { /* caller shows the error */ } finally { setBusy(false); }
  };
  const rescore = async () => {
    setBusy(true);
    try { await onRescore?.(); setStale(0); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {!dirty && stale > 0 && (
        <Banner tone="warning" title="Scores use the previous criteria" action={<Button size="sm" variant="secondary" icon="rotate-ccw" disabled={busy} onClick={() => void rescore()}>Rescore {stale}</Button>}>
          {stale} candidates were scored before this change. Rescoring uses AI credits and replaces current bands; manual edits are kept.
        </Banner>
      )}
      {crit.length === 0 && (
        <Banner tone="info" icon="list-checks" title="No scoring criteria yet">
          {canEdit ? "None were extracted from the JD (or no JD was uploaded). Add criteria manually below." : "None have been added for this position yet."}
        </Banner>
      )}
      <div className="shx-list">
        {crit.map((c) => (
          <RequirementRow key={c.id} req={c.req} imp={c.imp} origin={c.origin} editable={canEdit} onChange={(p) => upd(c.id, p)} onRemove={() => { setCrit((cs) => cs.filter((x) => x.id !== c.id)); setDirty(true); }} />
        ))}
      </div>
      {canEdit && (
        <div style={{ display: "flex", gap: 8 }}>
          <Button size="sm" variant="ghost" icon="plus" onClick={() => { setCrit((cs) => [...cs, { id: "n" + Date.now(), req: "New criterion", imp: "Nice to have", origin: "HR" }]); setDirty(true); }}>Add criterion</Button>
          {dirty && onSave && <Button size="sm" icon="check" disabled={busy} onClick={() => void save()}>Save criteria</Button>}
        </div>
      )}
    </div>
  );
}

const copyCrit = (job: Job): Crit[] => (job.criteria || []).map((c) => ({ id: c.id, req: c.req, imp: c.imp, origin: c.origin }));

export function DescriptionTab({ job, user, onRescore, onDetail, onSaveCriteria }: {
  job: Job; user: Role; onRescore?: () => Promise<void> | void; onDetail?: (key: DetailKey, value: string) => void;
  onSaveCriteria?: (crit: Crit[]) => Promise<number>;
}) {
  const [crit, setCrit] = React.useState<Crit[]>(() => copyCrit(job));
  // Reload criteria once AI finishes extracting the JD.
  const [proc, setProc] = React.useState(job.processing);
  if (proc !== job.processing) { setProc(job.processing); if (job.criteria) setCrit(copyCrit(job)); }
  const [seenCrit, setSeenCrit] = React.useState(job.criteria);
  if (seenCrit !== job.criteria) { setSeenCrit(job.criteria); setCrit(copyCrit(job)); }
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
        {job.procError ? (
          <Banner tone="warning" icon="triangle-alert" title="JD extraction failed">{job.procError}</Banner>
        ) : isNew && !job.blank ? (
          <Banner tone="ai" title="Fields filled from the JD">Violet fields are AI suggestions. Review and edit each one. Nothing is visible to candidates or other chapters until you open the position.</Banner>
        ) : isNew ? (
          <Banner tone="info" icon="pencil" title="Blank position">Fill in the fields and add scoring criteria, then open the position.</Banner>
        ) : null}
        <JdFields readOnly={!canEdit} ai={job.status === "Draft"} blank={job.blank} job={job} onDetail={onDetail} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, position: "sticky", top: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 className="jb-h2">Scoring criteria</h2><Badge tone="outline">{crit.length}</Badge><span style={{ flex: 1 }} />
          {job.status === "Draft" && job.reviewRequested && <Badge tone="warning" icon="clock">Waiting for Chapter Head review</Badge>}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Rule checks use these criteria. Extracted from the JD by AI.</div>
        <CriteriaEditor crit={crit} setCrit={setCrit} canEdit={canEdit} onSave={onSaveCriteria} onRescore={onRescore} />
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
  const [stages, setStages] = React.useState<Stage[]>(() => STAGES.map((s) => ({ ...s })));
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

type AccessGrant = Grant & { dto: AccessGrantDto };

function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function AddPersonDialog({ directory, busy, onClose, onAdd }: { directory: AccessDirectoryPerson[]; busy: boolean; onClose: () => void; onAdd: (p: AccessDirectoryPerson) => void }) {
  const [q, setQ] = React.useState("");
  const avail = directory.filter((p) => !q || (p.name + " " + p.email).toLowerCase().includes(q.toLowerCase()));
  const [who, setWho] = React.useState("");
  const person = avail.find((p) => p.id === who) ?? avail[0];
  return (
    <Dialog
      title="Add person to this position" description="They see this position and its candidates. Expected salary stays hidden unless they manage recruitment."
      onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!person || busy} onClick={() => person && onAdd(person)}>Add person</Button></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Input icon="search" size="sm" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        {avail.length ? (
          <Select label="Person" value={person?.id ?? ""} onChange={(e) => setWho(e.target.value)} options={avail.map((p) => ({ value: p.id, label: p.name + " · " + p.email }))} />
        ) : (
          <Banner tone="neutral" icon="users">{q ? "No one matches that search." : "Everyone in the directory already has access."}</Banner>
        )}
      </div>
    </Dialog>
  );
}

function AddChapterDialog({ chapters, busy, onClose, onAdd }: { chapters: { id: string; name: string }[]; busy: boolean; onClose: () => void; onAdd: (id: string) => void }) {
  const [id, setId] = React.useState("");
  const sel = chapters.find((c) => c.id === id) ?? chapters[0];
  return (
    <Dialog
      title="Add chapter to this position" description="Everyone in the chapter can see this position."
      onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!sel || busy} onClick={() => sel && onAdd(sel.id)}>Add chapter</Button></>}
    >
      {chapters.length ? (
        <Select label="Chapter" value={sel?.id ?? ""} onChange={(e) => setId(e.target.value)} options={chapters.map((c) => ({ value: c.id, label: c.name }))} />
      ) : (
        <Banner tone="neutral" icon="users">Every chapter already has access.</Banner>
      )}
    </Dialog>
  );
}

export function AccessTab({ user, uuid }: { user: Role; uuid?: string }) {
  const [data, setData] = React.useState<PositionAccess | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [rm, setRm] = React.useState<AccessGrant | null>(null);
  const [add, setAdd] = React.useState<"person" | "chapter" | null>(null);

  React.useEffect(() => {
    if (!uuid) return;
    const ac = new AbortController();
    setData(null);
    setError(null);
    fetchAccess(uuid, ac.signal).then(setData).catch((e: unknown) => {
      if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "Could not load access.");
    });
    return () => ac.abort();
  }, [uuid]);

  const grants: AccessGrant[] = (data?.grants ?? []).map((dto) => ({
    dto,
    name: dto.kind === "chapter" ? "Chapter " + dto.name : dto.name,
    kind: dto.kind === "chapter" ? "Chapter" : "Person",
    role: dto.email,
    by: dto.grantedBy ?? "—",
    at: fmtDate(dto.grantedAt),
    revocable: true,
  }));

  const mutate = async (method: "POST" | "DELETE", kind: "chapter" | "person", targetId: string) => {
    if (!uuid) return;
    setBusy(true);
    setError(null);
    try {
      setData(await changeAccess(uuid, method, kind, targetId));
      setAdd(null);
      setRm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update access.");
    } finally {
      setBusy(false);
    }
  };

  const canEdit = (user.key === "hr" || user.key === "ch") && !!uuid;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 820 }}>
      <div className="shx-row">
        <div className="jb-overline" style={{ flex: 1 }}>Who can see this position · {grants.length}</div>
        {canEdit && <><Button size="sm" variant="ghost" icon="plus" disabled={!data} onClick={() => setAdd("chapter")}>Add chapter</Button><Button size="sm" variant="ghost" icon="user-plus" disabled={!data} onClick={() => setAdd("person")}>Add person</Button></>}
      </div>
      {error && <Banner tone="danger" icon="triangle-alert">{error}</Banner>}
      {!data && !error && <Banner tone="neutral" icon="loader-circle">Loading access…</Banner>}
      {data && <AccessGrantList grants={grants} editable={canEdit} onRevoke={(g) => setRm(g as AccessGrant)} footnote="Admin and HR can always see every position. Admin access shows a banner and is written to the audit log." />}
      {add === "person" && data && <AddPersonDialog directory={data.directory} busy={busy} onClose={() => setAdd(null)} onAdd={(p) => void mutate("POST", "person", p.id)} />}
      {add === "chapter" && data && <AddChapterDialog chapters={data.chapters} busy={busy} onClose={() => setAdd(null)} onAdd={(id) => void mutate("POST", "chapter", id)} />}
      {rm && (
        <Dialog
          title={"Revoke access of " + rm.name + "?"}
          description={rm.name + " will lose access to this position and its candidates. Notes they wrote stay on the candidates."}
          onClose={() => setRm(null)}
          footer={<><Button variant="secondary" onClick={() => setRm(null)}>Cancel</Button><Button variant="danger" disabled={busy} onClick={() => void mutate("DELETE", rm.dto.kind, rm.dto.id)}>Revoke access</Button></>}
        >
          <div style={{ fontSize: 13, color: "var(--fg-2)" }}>This change is recorded with your name.</div>
        </Dialog>
      )}
    </div>
  );
}
