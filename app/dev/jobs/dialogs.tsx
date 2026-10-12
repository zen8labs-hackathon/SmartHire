"use client";

import * as React from "react";
import type { Job } from "./data";
import { Banner, Button, Checkbox, Dialog, DuplicateCompareCard, FileStatusRow, HireConfirmDialog, Icon, Input, Select, UploadQueuePanel, type FileStatusKey } from "./ext";

export type CreateJobInput = { file?: string; blank?: boolean; chapter: string; type: string; headcount: number };

const FLOW: [string, string, string][] = [["upload", "Upload JD", "You · now"], ["cpu", "System extracts", "Document + AI · < 1 min"], ["pencil", "Review on position page", "Edit fields & criteria"]];

export function CreateJobDialog({ onClose, onSubmit, defaultChapter = "Infra", lockChapter }: {
  onClose: () => void; onSubmit: (o: CreateJobInput) => void; defaultChapter?: string; lockChapter?: boolean;
}) {
  const [file, setFile] = React.useState<string | null>(null);
  const [chapter, setChapter] = React.useState(defaultChapter);
  const [type, setType] = React.useState("Full-time");
  const [hc, setHc] = React.useState("1");
  const hcN = Number(hc);
  const hcErr = !Number.isInteger(hcN) || hcN < 1 ? "Enter a whole number, 1 or more" : hcN > 50 ? "Maximum 50 per position" : undefined;
  return (
    <Dialog
      title="Open new position" width={620} onClose={onClose}
      description="Upload the JD. SmartHire extracts the text and uses AI to fill position fields and scoring criteria. You review and edit everything on the position page before it opens."
      footer={<>
        <button type="button" className="jb-textlink" style={{ marginRight: "auto" }} onClick={() => { if (!hcErr) onSubmit({ blank: true, chapter, type, headcount: hcN }); }}>No JD file? Start from a blank form</button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button icon="sparkles" disabled={!file || !!hcErr} onClick={() => file && onSubmit({ file, chapter, type, headcount: hcN })}>Upload &amp; extract</Button>
      </>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <ol className="jb-stepper" aria-label="Open new position steps">
          {FLOW.map(([, l, sub], i) => (
            <li key={l} className={i === 0 ? "is-cur" : ""} aria-current={i === 0 ? "step" : undefined}>
              <span className="jb-stepper__dot">{i + 1}</span><span className="jb-stepper__txt"><b>{l}</b><small>{sub}</small></span>
            </li>
          ))}
        </ol>
        {!file ? (
          <div className="jb-drop" style={{ cursor: "default" }}>
            <Icon name="file-up" size={20} /><b>Drag a JD file here</b><span>PDF or DOCX · max 10 MB · one file per position</span>
            <Button size="sm" variant="secondary" onClick={() => setFile("JD_Cloud_Engineer_AWS.pdf")}>Choose file</Button>
          </div>
        ) : (
          <div className="jb-file">
            <Icon name="file-text" size={18} />
            <div style={{ flex: 1 }}><b style={{ fontWeight: 600 }}>{file}</b><div className="shx-small">214 KB · ready to upload</div></div>
            <Button size="sm" variant="ghost" onClick={() => setFile(null)}>Replace</Button>
          </div>
        )}
        <div className="jb-form" style={{ paddingTop: 0 }}>
          <Select label="Chapter" value={chapter} onChange={(e) => setChapter(e.target.value)} disabled={lockChapter} options={["Infra", "Web", "Mobile", "QA", "Data", "BrSE"]} hint={lockChapter ? "Positions you create belong to your chapter" : "Decides who can see the position"} />
          <Select label="Hire type" value={type} onChange={(e) => setType(e.target.value)} options={["Full-time", "Internship"]} />
          <Input label="Headcount" type="number" min={1} max={50} step={1} value={hc} onChange={(e) => setHc(e.target.value)} suffix="people" error={hcErr} hint={hcErr ? undefined : "How many hires this position needs. You can change it later."} />
        </div>
        <div className="shx-small">The position is saved as a draft right away. Extraction takes under a minute; you can leave the page and get a notification when it&apos;s ready.</div>
      </div>
    </Dialog>
  );
}

export type UploadBatch = { to: string; src: string; n: number };
type UpFile = { n: string; s: string; bad?: string };
const FILES: UpFile[] = [{ n: "nguyen_van_an.pdf", s: "412 KB" }, { n: "tran_b_cv_2026.pdf", s: "380 KB" }, { n: "scan_cv_hoang.pdf", s: "2.1 MB" }, { n: "le_minh_chau_2026.pdf", s: "290 KB" }, { n: "portfolio.png", s: "1.4 MB", bad: "Not a PDF or DOCX — will be skipped" }];

export function UploadDialog({ dest, jobs, onClose, onStart }: { dest?: number | "pool" | null; jobs: Job[]; onClose: () => void; onStart: (b: UploadBatch) => void }) {
  const [to, setTo] = React.useState(String(dest || jobs[0].id));
  const [src, setSrc] = React.useState("");
  const [files, setFiles] = React.useState<UpFile[] | null>(null);
  const [tried, setTried] = React.useState(false);
  const ok = files ? files.filter((f) => !f.bad).length : 0;
  const start = () => { setTried(true); if (src && ok) onStart({ to, src, n: 25 }); };
  return (
    <Dialog
      title="Upload CVs" width={620} onClose={onClose}
      description="Files are read and scored in the background. You can leave this page; you'll get a notification when the batch finishes."
      footer={<>
        <span style={{ fontSize: 12, color: "var(--muted)", flex: 1 }}>{files ? ok + " of " + files.length + " files will be uploaded" : "PDF or DOCX · max 50 files per batch"}</span>
        <Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon="upload" onClick={start}>Upload {ok || ""}</Button>
      </>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="jb-form" style={{ paddingTop: 0 }}>
          <Select label="Upload to" value={to} onChange={(e) => setTo(e.target.value)} hint="Or keep CVs in the Talent pool without a position" options={[...jobs.filter((j) => j.status === "Open").map((j) => ({ value: String(j.id), label: j.title + " · #" + j.id })), { value: "pool", label: "Talent pool (no position)" }]} />
          <div>
            <Select label="CV source (required)" value={src} onChange={(e) => setSrc(e.target.value)} options={[{ value: "", label: "Choose source" }, "Referral", "Career site", "Email", "Partner school", "LinkedIn", "Other"]} />
            {tried && !src && <div className="sh-field__error" role="alert"><Icon name="circle-alert" size={14} />Choose where these CVs came from.</div>}
          </div>
        </div>
        {!files ? (
          <div className="jb-drop" style={{ cursor: "default" }}>
            <Icon name="upload" size={20} /><b>Drag PDF or DOCX files here</b><span>Max 10 MB each · up to 50 files per batch</span>
            <Button size="sm" variant="secondary" onClick={() => setFiles(FILES)}>Choose files</Button>
          </div>
        ) : (
          <div className="shx-list" style={{ maxHeight: 220, overflow: "auto" }}>
            {files.map((f) => (
              <div key={f.n} className="shx-li">
                <Icon name={f.bad ? "file-x" : "file-text"} size={16} style={{ color: f.bad ? "var(--danger)" : "var(--muted)" }} />
                <span style={{ flex: 1, minWidth: 0 }}><span style={{ fontWeight: 500 }}>{f.n}</span>{f.bad && <div style={{ fontSize: 12, color: "var(--danger)" }}>{f.bad}</div>}</span>
                <span className="sh-num" style={{ fontSize: 12, color: "var(--muted)" }}>{f.s}</span>
                <button type="button" className="sh-iconbtn sh-iconbtn--sm" aria-label={"Remove " + f.n} onClick={() => setFiles((fs) => (fs || []).filter((x) => x.n !== f.n))}><Icon name="x" size={14} /></button>
              </div>
            ))}
            <div className="shx-li shx-small">+ 20 more files</div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export function UploadTray({ batch, onOpen, onDone, onClose }: { batch: UploadBatch; onOpen: () => void; onDone: () => void; onClose: () => void }) {
  const [n, setN] = React.useState(0);
  const [min, setMin] = React.useState(false);
  const doneRef = React.useRef(onDone);
  React.useEffect(() => { doneRef.current = onDone; });
  React.useEffect(() => {
    if (n >= batch.n) { doneRef.current(); return; }
    const t = setTimeout(() => setN(n + 1), 260);
    return () => clearTimeout(t);
  }, [n, batch.n]);
  const done = n >= batch.n;
  const att = n > 8 ? (n > 14 ? 2 : 1) : 0;
  const existing = n > 4 ? (n > 18 ? 2 : 1) : 0;
  const rows: { file: string; status: FileStatusKey; detail?: string; actions?: { label: string }[] }[] = [
    { file: "nguyen_van_an.pdf", status: "done", detail: "New candidate" },
    { file: "tran_b_cv_2026.pdf", status: n > 4 ? "existing" : "processing", detail: n > 4 ? "Existing since 03/2025 · new application created for this position" : undefined },
    { file: "scan_cv_hoang.pdf", status: n > 8 ? "unreadable" : "processing", detail: n > 8 ? "Scanned image, no text layer" : undefined, actions: n > 8 ? [{ label: "Enter manually" }, { label: "Upload other file" }] : [] },
    { file: "le_minh_chau_2026.pdf", status: n > 14 ? "duplicate" : "pending", detail: n > 14 ? "Email matches an existing candidate; phone differs" : undefined },
  ];
  return (
    <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 60 }}>
      <UploadQueuePanel
        total={batch.n} processed={n} parsed={n - att - existing} existing={existing} attention={att} finished={done} collapsed={min} onToggle={() => setMin(!min)} onClose={onClose}
        footer={done ? <Button size="sm" icon="file-warning" onClick={onOpen}>Open Needs attention</Button> : null}
      >
        {rows.map((r) => <FileStatusRow key={r.file} {...r} />)}
      </UploadQueuePanel>
    </div>
  );
}

export function DuplicateDialog({ onClose, onResolve }: { onClose: () => void; onResolve: (how: "merge" | "new") => void }) {
  const R: [string, string, string, boolean][] = [
    ["Name", "Lê Minh Châu", "Lê Minh Châu", true],
    ["Email", "chau.le@gmail.com", "chau.le@gmail.com", true],
    ["Phone", "0912 345 678", "0987 111 222", false],
    ["Current role", "Frontend Dev · Sapo", "Web Developer · Sapo", false],
    ["Last application", "Web Developer #97 · 03/2025", "New CV", false],
  ];
  return (
    <Dialog title="Possible duplicate" description="Email matches an existing candidate but the phone number differs, so SmartHire did not merge them automatically." width={640} onClose={onClose}>
      <DuplicateCompareCard rows={R} onMerge={() => onResolve("merge")} onNew={() => onResolve("new")} />
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>Merging keeps both CV versions and uses the newest phone number. Creating a new candidate asks for a reason.</div>
    </Dialog>
  );
}

export function HireDialog({ c, job, onClose, onOk }: { c: { name: string }; job: Job; onClose: () => void; onOk: () => void }) {
  return (
    <HireConfirmDialog name={c.name} detail={job.title + " will have " + (job.hired + 1) + " of " + job.headcount + " positions filled."} onClose={onClose} onConfirm={onOk}>
      <div className="jb-form" style={{ paddingTop: 0 }}><Input label="Start date" defaultValue="15/10/2026" /><Input label="Probation ends" defaultValue="15/12/2026" hint="Mentor reminder 7 days before" /></div>
    </HireConfirmDialog>
  );
}

export function RejectDialog({ names, unreviewed, onClose, onOk }: { names: string[]; unreviewed?: number; onClose: () => void; onOk: () => void }) {
  const [r, setR] = React.useState("");
  const [keep, setKeep] = React.useState(true);
  return (
    <Dialog
      title={"Reject " + (names.length > 1 ? names.length + " candidates" : names[0]) + "?"}
      description={unreviewed ? unreviewed + " of these candidates have not been reviewed by a person. Their only negative signal is the AI match." : "Each rejection is written to the candidate history with your name."}
      onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" disabled={!r} onClick={onOk}>Reject</Button></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Select label="Reason (required)" value={r} onChange={(e) => setR(e.target.value)} options={[{ value: "", label: "Choose a reason" }, "Skills do not match", "Experience level", "Salary expectation", "Candidate withdrew", "Position filled", "Other"]} />
        <Checkbox checked={keep} onChange={(e) => setKeep(e.target.checked)} label="Keep in Talent pool for future positions" />
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Rejection emails are not sent automatically. Undo is available for 10 minutes.</div>
      </div>
    </Dialog>
  );
}

export function CloseJobDialog({ job, onClose, onOk }: { job: Job; onClose: () => void; onOk: () => void }) {
  const [revoke, setRevoke] = React.useState(true);
  const [notify, setNotify] = React.useState(false);
  return (
    <Dialog
      title={"Close " + job.title + "?"}
      description={job.candidates + " candidates are still active. They will move to the Talent pool with their current stage recorded. " + job.hired + " of " + job.headcount + " positions are filled."}
      onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={onOk}>Close position</Button></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Checkbox checked={revoke} onChange={(e) => setRevoke(e.target.checked)} label="Revoke public evaluation links for this position (3 active)" />
        <Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} label="Notify interviewers with upcoming schedules" />
      </div>
    </Dialog>
  );
}

export function HeadcountDialog({ job, onClose, onSave }: { job: Job; onClose: () => void; onSave: (n: number) => void }) {
  const [hc, setHc] = React.useState(String(job.headcount));
  const n = Number(hc);
  const err = !Number.isInteger(n) || n < 1 ? "Enter a whole number, 1 or more" : n < job.hired ? job.hired + " already hired — headcount can’t be lower" : n > 50 ? "Maximum 50 per position" : undefined;
  const down = !err && n < job.headcount;
  return (
    <Dialog
      title="Edit headcount" description={job.title + " · " + job.hired + " hired so far."} width={440} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!!err || n === job.headcount} onClick={() => onSave(n)}>Save headcount</Button></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Input label="Headcount" type="number" min={Math.max(1, job.hired)} max={50} step={1} value={hc} onChange={(e) => setHc(e.target.value)} suffix="people" error={err} hint={err ? undefined : n - job.hired + " still open after saving"} autoFocus />
        {down && n === job.hired && job.status === "Open" && <Banner tone="warning" title="All positions will be filled">The position stays open until you close it. Active candidates are not affected.</Banner>}
      </div>
    </Dialog>
  );
}
