 
"use client";

import * as React from "react";
import { Badge, Banner, Button, Dialog, Icon, Input, Select } from "../position-management-2/ext";
import type { Job, Person } from "./data";
import { compareCvs, type CvCompareSide } from "./api";

function Opt({ on, disabled, onClick, children, name }: { on?: boolean; disabled?: boolean; onClick: () => void; name: string; children: React.ReactNode }) {
  return (
    <label className={"cd-opt" + (on ? " is-on" : "")} aria-disabled={disabled || undefined}>
      <input type="radio" name={name} checked={!!on} disabled={disabled} onChange={onClick} />
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>{children}</span>
    </label>
  );
}

export function AddToPositionDialog({ people, jobs, onClose, onOk }: { people: Person[]; jobs: Job[]; onClose: () => void; onOk: (job: Job, count: number, cv: string) => void }) {
  const open = jobs.filter((j) => j.status === "Open");
  const one = people.length === 1 ? people[0] : null;
  const already = (j: Job) => people.filter((p) => p.apps.some((a) => a.job === j.id && a.result === "open")).length;
  const first = open.find((j) => already(j) < people.length);
  const [job, setJob] = React.useState<number | undefined>(first && first.id);
  const [cv, setCv] = React.useState("reuse");
  const j = open.find((x) => x.id === job);
  const skip = j ? already(j) : 0;
  const latest = one && (one.cvs.find((c) => c.latest && c.status !== "failed") || one.cvs[0]);
  return (
    <Dialog
      title={one ? "Add " + one.name + " to a position" : "Add " + people.length + " candidates to a position"}
      description="Creates a new application. Previous applications stay unchanged." onClose={onClose} width={600}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon="briefcase" disabled={!j || skip === people.length} onClick={() => j && onOk(j, people.length - skip, cv)}>{one ? "Add to position" : "Add " + (people.length - skip) + " candidates"}</Button></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="jb-overline">Open positions</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflow: "auto" }}>
          {open.map((x) => {
            const n = already(x);
            const all = n === people.length;
            return (
              <Opt key={x.id} name="pos" on={job === x.id} disabled={all} onClick={() => setJob(x.id)}>
                <span className="shx-row" style={{ gap: 6 }}>
                  <b style={{ fontWeight: 600 }}>{x.title}</b><span className="shx-small">#{x.id} · {x.chapter}</span><span className="shx-sp" />
                  {all ? <Badge tone="info" icon="circle-dot">Already applying</Badge> : n > 0 ? <Badge tone="outline">{n} already applying · skipped</Badge> : null}
                </span>
                <span className="shx-small">{x.candidates} candidates · {x.hired}/{x.headcount} hired · deadline {x.deadline}</span>
              </Opt>
            );
          })}
        </div>
        <div className="jb-overline">CV for the new application</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Opt name="cv" on={cv === "reuse"} onClick={() => setCv("reuse")}>
            <b style={{ fontWeight: 500 }}>Reuse the latest CV{one ? "" : " of each candidate"}</b>
            <span className="shx-small">{one && latest ? latest.file + " · " + latest.date + ". " : ""}Parsed data is copied; only scoring runs against this position’s criteria.</span>
          </Opt>
          <Opt name="cv" on={cv === "new"} disabled={!one} onClick={() => setCv("new")}>
            <b style={{ fontWeight: 500 }}>Upload a new CV</b>
            <span className="shx-small">{one ? "Goes through reading and scoring as a normal upload." : "Available when adding one candidate."}</span>
          </Opt>
        </div>
        <span className="shx-small">AI proposes a match band after scoring. Nobody is moved or rejected automatically.</span>
      </div>
    </Dialog>
  );
}

export function MergeDialog({ a, b, onClose, onOk }: { a: Person; b: Person; onClose: () => void; onOk: () => void }) {
  const F: [keyof Person, string][] = [["name", "Full name"], ["email", "Email"], ["phone", "Phone"], ["role", "Current role"], ["exp", "Experience"], ["company", "Company"], ["english", "English"]];
  const newer = pdNum(b.created) > pdNum(a.created) ? b : a;
  const [p, setP] = React.useState<Record<string, string>>(() => Object.fromEntries(F.map(([k]) => [k, String(a[k]) === String(b[k]) ? "same" : newer === b ? "b" : "a"])));
  const val = (x: Person, k: keyof Person) => (k === "exp" ? x[k] + " years" : String(x[k]));
  const cell = (x: Person, side: string, k: keyof Person) => {
    const same = p[k] === "same";
    return (
      <div className={same ? "" : p[k] === side ? "is-m" : ""}>
        {same ? <span>{val(x, k)}</span> : (
          <label className="shx-row" style={{ gap: 6, cursor: "pointer" }}>
            <input type="radio" name={"m-" + k} checked={p[k] === side} onChange={() => setP({ ...p, [k]: side })} />{val(x, k)}
          </label>
        )}
      </div>
    );
  };
  const napps = a.apps.length + b.apps.length;
  return (
    <Dialog
      title="Merge candidate records" description="Choose which value to keep for each field that differs. Applications and CV files from both records move to the kept record." onClose={onClose} width={720}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon="git-merge" onClick={onOk}>Merge into one record</Button></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="shx-cmp" style={{ gridTemplateColumns: "130px 1fr 1fr" }}>
          <div>Field</div>
          <div>First seen {a.created} · {a.apps.length} {a.apps.length === 1 ? "application" : "applications"}</div>
          <div>First seen {b.created} · {b.apps.length} {b.apps.length === 1 ? "application" : "applications"}</div>
          {F.map(([k, l]) => (
            <React.Fragment key={k}>
              <div className="shx-small" style={{ color: "var(--fg-2)" }}>{l}{p[k] === "same" && <Icon name="check" size={12} style={{ color: "var(--success)" }} />}</div>
              {cell(a, "a", k)}{cell(b, "b", k)}
            </React.Fragment>
          ))}
        </div>
        <Banner tone="warning" icon="triangle-alert">{napps} applications and {a.cvs.length + b.cvs.length} CV files will belong to one record. The phone number you don’t keep stops matching new CVs. Merging can be undone by an Admin for 30 days.</Banner>
      </div>
    </Dialog>
  );
}

function pdNum(s: string): number {
  const [d, m, y] = s.split("/").map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function DeleteDialog({ p, onClose, onOk }: { p: Person; onClose: () => void; onOk: (mode: "anon" | "del") => void }) {
  const [mode, setMode] = React.useState<"anon" | "del">("anon");
  const [ok, setOk] = React.useState(false);
  const open = p.apps.filter((a) => a.result === "open");
  return (
    <Dialog
      title={"Delete or anonymize " + p.name} description="Use this when the candidate asks for their data to be removed or the retention period has ended." onClose={onClose} width={560}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" icon={mode === "anon" ? "user-x" : "trash-2"} disabled={!ok} onClick={() => onOk(mode)}>{mode === "anon" ? "Anonymize candidate" : "Delete candidate"}</Button></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Opt name="del" on={mode === "anon"} onClick={() => setMode("anon")}><b style={{ fontWeight: 500 }}>Anonymize</b><span className="shx-small">Removes name, email, phone, date of birth and CV files. Keeps stage history as “Anonymized candidate” for hiring reports.</span></Opt>
        <Opt name="del" on={mode === "del"} onClick={() => setMode("del")}><b style={{ fontWeight: 500 }}>Delete</b><span className="shx-small">Removes the record and all {p.apps.length} applications, including notes and evaluations.</span></Opt>
        {open.length > 0 && <Banner tone="danger" icon="triangle-alert">{p.name} is still applying to {open.map((a) => a.title + " #" + a.job).join(", ")}. {open.length === 1 ? "This application ends" : "These applications end"} immediately.</Banner>}
        <label className="shx-row" style={{ gap: 8, fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />I understand this can’t be undone and will be recorded in the audit log.</label>
      </div>
    </Dialog>
  );
}

export function ContactDialog({ p, onClose, onOk }: { p: Person; onClose: () => void; onOk: (v: { email: string; phone: string }) => void }) {
  const [email, setEmail] = React.useState(p.email);
  const [phone, setPhone] = React.useState(p.phone);
  const changed = email !== p.email || phone !== p.phone;
  return (
    <Dialog
      title="Edit contact" description="Email and phone are used to recognise this person when a new CV arrives." onClose={onClose} width={520}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!changed} onClick={() => onOk({ email, phone })}>Save contact</Button></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Input label="Email" value={email} onChange={(e: any) => setEmail(e.target.value)} />
        <Input label="Phone" value={phone} onChange={(e: any) => setPhone(e.target.value)} />
        {changed && <Banner tone="warning" icon="triangle-alert">New CVs sent with the old {email !== p.email ? "email " + p.email : "phone " + p.phone} will no longer match {p.name}. They will appear as a possible duplicate instead.</Banner>}
      </div>
    </Dialog>
  );
}

export function UploadCVDialog({ p, onClose, onOk }: { p: Person; onClose: () => void; onOk: (file: File, target: string) => void | Promise<void> }) {
  const targets = [
    ...p.apps.filter((a) => a.result === "open" || a.result === "pool").map((a) => ({ label: a.title + " · " + a.date, target: a.id })),
    { label: "Talent pool", target: "pool" },
  ];
  const [to, setTo] = React.useState(targets[0].label);
  const [file, setFile] = React.useState<File | null>(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!/\.(pdf|docx)$/i.test(f.name)) return setErr("Only PDF or DOCX files are accepted.");
    if (f.size > 10 * 1024 * 1024) return setErr("File is larger than 10 MB.");
    setErr(""); setFile(f);
  };
  const submit = async () => {
    if (!file) return;
    setBusy(true);
    try { await onOk(file, targets.find((t) => t.label === to)?.target ?? "pool"); } finally { setBusy(false); }
  };
  return (
    <Dialog
      title={"Upload CV for " + p.name} description="The file is read and scored in the background. You can keep working." onClose={onClose} width={520}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon="upload" disabled={!file || busy} onClick={submit}>{busy ? "Uploading…" : "Upload"}</Button></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Select label="Attach to" value={to} onChange={(e: any) => setTo(e.target.value)} options={targets.map((t) => t.label)} />
        <input ref={input} type="file" accept=".pdf,.docx" hidden onChange={(e) => pick(e.target.files?.[0])} />
        {file ? (
          <div className="jb-file"><Icon name="file-text" size={16} /><span style={{ flex: 1 }}>{file.name}</span><button className="sh-iconbtn sh-iconbtn--sm" aria-label="Remove file" onClick={() => setFile(null)}><Icon name="x" size={14} /></button></div>
        ) : (
          <button className="jb-drop" onClick={() => input.current?.click()}><Icon name="upload" size={20} />Choose a CV file<span>PDF or DOCX · up to 10 MB</span></button>
        )}
        {err && <span className="shx-small" style={{ color: "var(--danger, #c0392b)" }}>{err}</span>}
        <span className="shx-small">Becomes a new CV version on the chosen application. Professional information updates from it, except fields a person edited.</span>
      </div>
    </Dialog>
  );
}

export function CompareCVDialog({ p, onClose }: { p: Person; onClose: () => void }) {
  const cvs = p.cvs;
  const [a, setA] = React.useState(cvs[1]?.id ?? cvs[0]?.id ?? "");
  const [b, setB] = React.useState(cvs[0]?.id ?? "");
  const [data, setData] = React.useState<{ a: CvCompareSide; b: CvCompareSide } | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!p.uuid || !a || !b) return;
    let live = true;
    setData(null);
    setErr(null);
    compareCvs(p.uuid, a, b)
      .then((d) => { if (live) setData(d); })
      .catch((e: unknown) => { if (live) setErr(e instanceof Error ? e.message : "Could not compare CVs."); });
    return () => { live = false; };
  }, [p.uuid, a, b]);

  const opts = cvs.map((c) => ({ value: c.id, label: `${c.file} · ${c.date}` }));
  const dash = (v: string | null | undefined) => v || "Not found in CV";
  const rows: [string, string, string][] = data
    ? [
        ["Current role", dash(data.a.role), dash(data.b.role)],
        ["Experience", data.a.experienceYears ? `${data.a.experienceYears} years` : "Not found in CV", data.b.experienceYears ? `${data.b.experienceYears} years` : "Not found in CV"],
        ["Skills", data.a.skills.join(", ") || "Not found in CV", data.b.skills.join(", ") || "Not found in CV"],
        ["English", dash(data.a.english), dash(data.b.english)],
        ["Education", dash(data.a.education), dash(data.b.education)],
      ]
    : [];
  return (
    <Dialog title="Compare CVs" description="Fields read from each file. Differences are highlighted." onClose={onClose} width={760} footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="shx-cmp" style={{ gridTemplateColumns: "120px 1fr 1fr" }}>
          <div>Field</div>
          <Select aria-label="First CV" value={a} onChange={(e) => setA(e.target.value)} options={opts} />
          <Select aria-label="Second CV" value={b} onChange={(e) => setB(e.target.value)} options={opts} />
          {rows.map(([f, x, y]) => (
            <React.Fragment key={f}>
              <div className="shx-small" style={{ color: "var(--fg-2)" }}>{f}</div>
              <div className={x !== y ? "is-d" : ""}>{x}</div><div className={x !== y ? "is-d" : ""}>{y}</div>
            </React.Fragment>
          ))}
        </div>
        {err && <Banner tone="warning" icon="file-warning">{err}</Banner>}
        {!err && !data && <span className="shx-small">Loading…</span>}
      </div>
    </Dialog>
  );
}
