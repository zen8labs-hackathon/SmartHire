"use client";

import * as React from "react";
import type { Candidate, Job, Stage } from "./data";
import { CANDIDATE_SOURCE_VALUES } from "@/lib/candidates/source-constants";
import { MAX_BATCH_FILES, MAX_CV_BYTES, isAllowedCvFilename } from "@/lib/candidates/upload-constants";
import { fetchPeople, fetchPositionMembers, type PositionMember, fetchCandidateApplications, type PersonChoice, uploadPositionCvs, type CandidateApplication, type CvFileState, type CvUploadResult } from "./api";
import { HIRE_TYPES, validateHeadcount, validateJdFile } from "@/lib/position/position-rules";
import { Banner, Button, Checkbox, Dialog, FileStatusRow, HireConfirmDialog, Icon, Input, Radio, Select, UploadQueuePanel, type FileStatusKey } from "./ext";

export type CreateJobInput = { file?: File; blank?: boolean; chapterId: string; type: string; headcount: number; pipelineId: string; people?: Assignee[] };
export type Assignee = PersonChoice & { role: "recruiter" | "interviewer" };
export type ChapterChoice = { id: string; name: string };

const FLOW: [string, string, string][] = [["upload", "Upload JD", "You · now"], ["cpu", "System extracts", "Document + AI · < 1 min"], ["pencil", "Review on position page", "Edit fields & criteria"]];

const ROLE_LABEL: Record<Assignee["role"], string> = { recruiter: "Recruiter", interviewer: "Interviewer" };

function PeoplePicker({ value, onChange }: { value: Assignee[]; onChange: (next: Assignee[]) => void }) {
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<PersonChoice[]>([]);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    if (!q.trim()) { setResults([]); setFailed(false); return; }
    const ac = new AbortController();
    const t = setTimeout(() => {
      fetchPeople(q.trim(), ac.signal).then((r) => { setResults(r); setFailed(false); }).catch((e) => { if (!ac.signal.aborted) { setResults([]); setFailed(true); } void e; });
    }, 200);
    return () => { clearTimeout(t); ac.abort(); };
  }, [q]);
  const taken = new Map(value.map((a) => [a.id, a.role]));
  const add = (p: PersonChoice, role: Assignee["role"]) => { onChange([...value.filter((a) => a.id !== p.id), { ...p, role }]); setQ(""); setResults([]); };
  return (
    <div>
      <Input label="People (optional)" icon="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" hint="Search once, then add each person as a recruiter or an interviewer. Add as many as needed." />
      {failed && <div className="shx-small" style={{ color: "var(--danger)" }}>Could not load people.</div>}
      {results.length > 0 && (
        <div className="shx-list" style={{ maxHeight: 180, overflow: "auto", marginTop: 6 }}>
          {results.map((p) => {
            const cur = taken.get(p.id);
            return (
              <div key={p.id} className="shx-li">
                <span style={{ flex: 1, minWidth: 0 }}><b style={{ fontWeight: 500 }}>{p.name}</b><div className="shx-small">{p.email}</div></span>
                {(["recruiter", "interviewer"] as const).map((r) => (
                  <Button key={r} size="sm" variant="secondary" disabled={cur === r} onClick={() => add(p, r)}>{cur === r ? ROLE_LABEL[r] + " ✓" : "+ " + ROLE_LABEL[r]}</Button>
                ))}
              </div>
            );
          })}
        </div>
      )}
      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {value.map((a) => (
            <span key={a.id} className="sh-chip sh-chip--neutral" title={a.email}>
              {a.name} · {ROLE_LABEL[a.role]}
              <button type="button" className="sh-iconbtn sh-iconbtn--sm" aria-label={"Remove " + a.name} onClick={() => onChange(value.filter((x) => x.id !== a.id))}><Icon name="x" size={12} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function CreateJobDialog({ onClose, onSubmit, chapters, pipelines, defaultChapterId, lockChapter, busy, error }: {
  onClose: () => void; onSubmit: (o: CreateJobInput) => void; chapters: ChapterChoice[]; pipelines: { id: string; name: string }[]; defaultChapterId?: string; lockChapter?: boolean; busy?: boolean; error?: string | null;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [fileErr, setFileErr] = React.useState<string | null>(null);
  const [chapterId, setChapterId] = React.useState(defaultChapterId ?? chapters[0]?.id ?? "");
  const [type, setType] = React.useState<string>(HIRE_TYPES[0]);
  const [hc, setHc] = React.useState("1");
  const [pipelineId, setPipelineId] = React.useState("");
  const [tried, setTried] = React.useState(false);
  const [people, setPeople] = React.useState<Assignee[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const hcErr = validateHeadcount(hc).error ?? undefined;
  const hcN = validateHeadcount(hc).value ?? 1;
  const pick = (f: File | undefined) => {
    if (!f) return;
    const err = validateJdFile({ name: f.name, size: f.size });
    setFileErr(err ?? null);
    setFile(err ? null : f);
  };
  const ready = !!chapterId && !hcErr && !busy;
  const pipelineErr = tried && !pipelineId ? "Select a pipeline to continue." : undefined;
  const guard = (go: () => void) => { setTried(true); if (pipelineId) go(); };
  return (
    <Dialog
      title="Open new position" width={620} onClose={onClose}
      description="Upload the JD. SmartHire extracts the text and uses AI to fill position fields and scoring criteria. You review and edit everything on the position page before it opens."
      footer={<>
        <button type="button" className="jb-textlink" style={{ marginRight: "auto" }} disabled={!ready} onClick={() => guard(() => onSubmit({ blank: true, chapterId, type, headcount: hcN, pipelineId, people }))}>No JD file? Start from a blank form</button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button icon="sparkles" disabled={!file || !ready} onClick={() => file && guard(() => onSubmit({ file, chapterId, type, headcount: hcN, pipelineId, people }))}>{busy ? "Creating…" : "Upload & extract"}</Button>
      </>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <input ref={inputRef} type="file" hidden accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        <ol className="jb-stepper" aria-label="Open new position steps">
          {FLOW.map(([, l, sub], i) => (
            <li key={l} className={i === 0 ? "is-cur" : ""} aria-current={i === 0 ? "step" : undefined}>
              <span className="jb-stepper__dot">{i + 1}</span><span className="jb-stepper__txt"><b>{l}</b><small>{sub}</small></span>
            </li>
          ))}
        </ol>
        {!file ? (
          <div className="jb-drop" style={{ cursor: "default" }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}>
            <Icon name="file-up" size={20} /><b>Drag a JD file here</b><span>PDF or DOCX · max 10 MB · one file per position</span>
            <Button size="sm" variant="secondary" onClick={() => inputRef.current?.click()}>Choose file</Button>
          </div>
        ) : (
          <div className="jb-file">
            <Icon name="file-text" size={18} />
            <div style={{ flex: 1 }}><b style={{ fontWeight: 600 }}>{file.name}</b><div className="shx-small">{Math.max(1, Math.round(file.size / 1024))} KB · ready to upload</div></div>
            <Button size="sm" variant="ghost" onClick={() => inputRef.current?.click()}>Replace</Button>
          </div>
        )}
        {fileErr && <Banner tone="danger" icon="file-warning">{fileErr}</Banner>}
        {error && <Banner tone="danger" icon="triangle-alert">{error}</Banner>}
        <div className="jb-form" style={{ paddingTop: 0 }}>
          <Select label="Chapter" value={chapterId} onChange={(e) => setChapterId(e.target.value)} disabled={lockChapter} options={chapters.map((c) => ({ value: c.id, label: c.name }))} hint={lockChapter ? "Positions you create belong to your chapter" : "Decides who can see the position"} />
          <Select label="Hire type" value={type} onChange={(e) => setType(e.target.value)} options={[...HIRE_TYPES]} />
          <div><Select label="Pipeline (required)" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)} options={[{ value: "", label: "Choose a pipeline" }, ...pipelines.map((p) => ({ value: p.id, label: p.name }))]} hint={pipelines.length === 0 ? "No pipelines available yet — ask HR to create one first" : "Hiring stages for this position. It can’t be changed after the position is created."} />{pipelineErr && <div className="sh-field__error" role="alert"><Icon name="circle-alert" size={14} />{pipelineErr}</div>}</div>
          <Input label="Headcount" type="number" min={1} max={50} step={1} value={hc} onChange={(e) => setHc(e.target.value)} suffix="people" error={hcErr} hint={hcErr ? undefined : "How many hires this position needs. You can change it later."} />
        </div>
        <PeoplePicker value={people} onChange={setPeople} />
        <div className="shx-small">The position is saved as a draft right away. Extraction takes under a minute; you can leave the page and get a notification when it&apos;s ready.</div>
      </div>
    </Dialog>
  );
}

export type UploadBatch = { to: string; src: string; recruiter?: string; files: File[]; target: string };
const CV_ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
// Canonical sources from the legacy /admin/jd flow first (stored as-is on
// campaign_applied.source), then labels that map to "Other (<label>)".
const CV_SOURCES = [...CANDIDATE_SOURCE_VALUES.filter((s) => s !== "Other"), "Referral", "Email", "Partner school", "Other"];

function cvFileError(f: File): string | null {
  if (!isAllowedCvFilename(f.name)) return "Not a PDF or DOCX — will be skipped";
  if (f.size > MAX_CV_BYTES) return `Larger than ${MAX_CV_BYTES / 1024 / 1024} MB — will be skipped`;
  return null;
}
const fmtSize = (n: number) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");

export function UploadDialog({ dest, lockDest, jobs, resolveTarget, onClose, onStart }: {
  dest?: number | "pool" | null; lockDest?: boolean; jobs: Job[]; resolveTarget: (to: string) => string | undefined; onClose: () => void; onStart: (b: UploadBatch) => void;
}) {
  const openJobs = jobs.filter((j) => j.status === "Open");
  const destOpts = [...openJobs.map((j) => ({ value: String(j.id), label: j.title + " · #" + j.id }))];
  const [to, setTo] = React.useState(String(dest ?? destOpts[0].value));
  const [srcPick, setSrcPick] = React.useState("");
  const [srcOther, setSrcOther] = React.useState("");
  const [recruiter, setRecruiter] = React.useState("");
  const src = srcPick === "Other" ? srcOther.trim() : srcPick;
  const [files, setFiles] = React.useState<File[]>([]);
  const [tried, setTried] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const add = (list: FileList | null | undefined) => {
    if (!list) return;
    setFiles((cur) => {
      const seen = new Set(cur.map((f) => f.name + f.size));
      return [...cur, ...Array.from(list).filter((f) => !seen.has(f.name + f.size))];
    });
  };
  const valid = files.filter((f) => !cvFileError(f));
  const tooMany = valid.length > MAX_BATCH_FILES;
  const target = resolveTarget(to);
  const start = () => {
    setTried(true);
    if (src && valid.length && !tooMany && target) onStart({ to, src, recruiter: recruiter.trim() || undefined, files: valid, target });
  };
  // Locked: show only the fixed destination (the position/pool the page is on).
  const options = lockDest ? destOpts.filter((o) => o.value === to) : destOpts;
  const lockedOpts = lockDest && options.length === 0 ? [{ value: to, label: to === "pool" ? "Talent pool (no position)" : "This position" }] : options;
  return (
    <Dialog
      title="Upload CVs" width={620} onClose={onClose}
      description="Files are read and scored in the background. You can leave this page; you'll get a notification when the batch finishes."
      footer={<>
        <span style={{ fontSize: 12, color: "var(--muted)", flex: 1 }}>{files.length ? valid.length + " of " + files.length + " files will be uploaded" : `PDF or DOCX · max ${MAX_BATCH_FILES} files per batch`}</span>
        <Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon="upload" disabled={!valid.length || tooMany} onClick={start}>Upload {valid.length || ""}</Button>
      </>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <input ref={inputRef} type="file" hidden multiple accept={CV_ACCEPT} onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        <div className="jb-form" style={{ paddingTop: 0 }}>
          <Select label="Upload to" value={to} onChange={(e) => setTo(e.target.value)} disabled={lockDest} hint={lockDest ? "CVs are added to this position" : undefined} options={lockedOpts} />
          <Input label="Recruiter (optional)" value={recruiter} maxLength={120} onChange={(e) => setRecruiter(e.target.value)} placeholder="Defaults to you" />
          <div>
            <Select label="CV source (required)" value={srcPick} onChange={(e) => setSrcPick(e.target.value)} options={[{ value: "", label: "Choose source" }, ...CV_SOURCES]} />
            {srcPick === "Other" && <Input label="Source name" value={srcOther} maxLength={60} onChange={(e) => setSrcOther(e.target.value)} placeholder="e.g. Job fair" />}
            {tried && !src && <div className="sh-field__error" role="alert"><Icon name="circle-alert" size={14} />Choose where these CVs came from.</div>}
          </div>
        </div>
        {tried && !target && <Banner tone="danger" icon="triangle-alert">Pick a position that is still loading, or try again.</Banner>}
        {tooMany && <Banner tone="danger" icon="triangle-alert">A batch is limited to {MAX_BATCH_FILES} files. Remove some to continue.</Banner>}
        <div className="jb-drop" style={{ cursor: "default" }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}>
          <Icon name="upload" size={20} /><b>Drag PDF or DOCX files here</b><span>Max {MAX_CV_BYTES / 1024 / 1024} MB each · up to {MAX_BATCH_FILES} files per batch</span>
          <Button size="sm" variant="secondary" onClick={() => inputRef.current?.click()}>{files.length ? "Add more files" : "Choose files"}</Button>
        </div>
        {files.length > 0 && (
          <div className="shx-list" style={{ maxHeight: 220, overflow: "auto" }}>
            {files.map((f) => {
              const bad = cvFileError(f);
              return (
                <div key={f.name + f.size} className="shx-li">
                  <Icon name={bad ? "file-x" : "file-text"} size={16} style={{ color: bad ? "var(--danger)" : "var(--muted)" }} />
                  <span style={{ flex: 1, minWidth: 0 }}><span style={{ fontWeight: 500 }}>{f.name}</span>{bad && <div style={{ fontSize: 12, color: "var(--danger)" }}>{bad}</div>}</span>
                  <span className="sh-num" style={{ fontSize: 12, color: "var(--muted)" }}>{fmtSize(f.size)}</span>
                  <button type="button" className="sh-iconbtn sh-iconbtn--sm" aria-label={"Remove " + f.name} onClick={() => setFiles((fs) => fs.filter((x) => x !== f))}><Icon name="x" size={14} /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Dialog>
  );
}

export function UploadTray({ batch, onOpen, onDone, onClose }: { batch: UploadBatch; onOpen: () => void; onDone: (r: CvUploadResult | Error) => void; onClose: () => void }) {
  const total = batch.files.length;
  const [st, setSt] = React.useState<{ s: CvFileState; e?: string }[]>(() => batch.files.map(() => ({ s: "pending" })));
  const [min, setMin] = React.useState(false);
  const [finished, setFinished] = React.useState(false);
  const [fatal, setFatal] = React.useState<string | null>(null);
  const [bytes, setBytes] = React.useState<number[]>(() => batch.files.map(() => 0));
  const doneRef = React.useRef(onDone);
  React.useEffect(() => { doneRef.current = onDone; });
  React.useEffect(() => {
    let live = true;
    uploadPositionCvs(batch.target, batch.files, batch.src, (i, s, e) => live && setSt((cur) => cur.map((x, k) => (k === i ? { s, e } : x))), { recruiter: batch.recruiter, onBytes: (i, loaded) => { if (live) setBytes((cur) => cur.map((v, k) => (k === i ? loaded : v))); } })
      .then((r) => { if (live) { setFinished(true); doneRef.current(r); } })
      .catch((e) => { if (live) { setFatal(e instanceof Error ? e.message : "Upload failed."); setFinished(true); doneRef.current(e instanceof Error ? e : new Error("Upload failed.")); } });
    return () => { live = false; };
  }, [batch]);
  const queued = st.filter((x) => x.s === "queued").length;
  const failed = st.filter((x) => x.s === "error").length;
  const totalBytes = batch.files.reduce((a, f) => a + f.size, 0) || 1;
  const sentBytes = bytes.reduce((a, v) => a + v, 0);
  const pct = Math.min(100, Math.round((sentBytes / totalBytes) * 100));
  const rows: { file: string; status: FileStatusKey; detail?: string }[] = batch.files.map((f, i) => {
    const x = st[i];
    const p = f.size ? Math.min(100, Math.round((bytes[i] / f.size) * 100)) : 0;
    return { file: f.name, status: x.s === "queued" ? "done" : x.s === "error" ? "error" : "processing", detail: x.s === "queued" ? "Uploaded · scoring in the background" : x.s === "error" ? x.e : x.s === "uploading" ? `Uploading ${p}%` : undefined };
  });
  return (
    <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 60 }}>
      <UploadQueuePanel
        total={total} processed={queued + failed} parsed={queued} existing={0} attention={failed} finished={finished} collapsed={min} onToggle={() => setMin(!min)} onClose={onClose}
        footer={finished && !fatal ? <Button size="sm" icon="users" onClick={onOpen}>View candidates</Button> : null}
      >
        {fatal && <Banner tone="danger" icon="triangle-alert">{fatal}</Banner>}
        {!finished && <div className="shx-small">Uploaded {fmtSize(sentBytes)} of {fmtSize(totalBytes)} · {pct}%</div>}
        {rows.map((r) => <FileStatusRow key={r.file} {...r} />)}
      </UploadQueuePanel>
    </div>
  );
}

export function ApplicationsDialog({ target, fileId, file, onClose }: { target: string; fileId: string; file: string; onClose: () => void }) {
  const [apps, setApps] = React.useState<CandidateApplication[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    let live = true;
    fetchCandidateApplications(target, fileId).then((a) => live && setApps(a)).catch((e) => live && setErr(e instanceof Error ? e.message : "Could not load applications."));
    return () => { live = false; };
  }, [target, fileId]);
  return (
    <Dialog title="Already applied" description={`${file} matches an existing candidate. Their applications:`} width={560} onClose={onClose}
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {err ? <Banner tone="danger" icon="triangle-alert">{err}</Banner>
        : !apps ? <span className="shx-small">Loading…</span>
        : !apps.length ? <span className="shx-small">No applications found.</span>
        : <div className="shx-list">{apps.map((a) => (
          <div key={a.id} className="shx-file">
            <div className="shx-row"><b style={{ fontWeight: 600 }}>{a.jobTitle}</b><span className="shx-sp" /><span className="shx-small">{a.stageLabel ?? "—"}{a.subStageLabel ? " · " + a.subStageLabel : ""}</span></div>
            <span className="shx-small">{a.appliedAt ? "Applied " + new Date(a.appliedAt).toLocaleDateString("en-GB") : ""}{a.cvOriginalFilename ? " · " + a.cvOriginalFilename : ""}</span>
          </div>))}</div>}
    </Dialog>
  );
}

/** Hire = move into the probation-type stage. `startDate` is YYYY-MM-DD (`campaign_applied.start_date`); the Mentor (required) is someone already added to the position. */
export function HireDialog({ c, job, jobUuid, onClose, onOk }: { c: { name: string }; job: Job; jobUuid?: string; onClose: () => void; onOk: (o: { startDate: string; mentorId: string }) => void }) {
  const [date, setDate] = React.useState("");
  const [mentor, setMentor] = React.useState("");
  const [members, setMembers] = React.useState<PositionMember[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!jobUuid) { setMembers([]); return; }
    const ac = new AbortController();
    fetchPositionMembers(jobUuid, ac.signal).then(setMembers).catch((e) => { if (!ac.signal.aborted) { setErr(e instanceof Error ? e.message : "Could not load people."); setMembers([]); } });
    return () => ac.abort();
  }, [jobUuid]);
  const options = [{ value: "", label: members ? "Choose a Mentor" : "Loading…" }, ...(members ?? []).map((m) => ({ value: m.id, label: m.name + " · " + (m.role === "recruiter" ? "Recruiter" : "Interviewer") }))];
  return (
    <HireConfirmDialog name={c.name} detail={job.title + " will have " + (job.hired + 1) + " of " + job.headcount + " positions filled."} onClose={onClose} disabled={!date || !mentor} onConfirm={() => date && mentor && onOk({ startDate: date, mentorId: mentor })}>
      <div className="jb-form" style={{ paddingTop: 0 }}>
        <Input label="Start date" type="date" value={date} onChange={(e) => setDate(e.target.value)} hint="The candidate's agreed first working day" />
        <Select label="Mentor (required)" value={mentor} onChange={(e) => setMentor(e.target.value)} options={options} />
        <div style={{ fontSize: 12, color: "var(--muted)" }}>{err ?? (members && !members.length ? "No one has been added to this position yet. Add an interviewer or recruiter first." : "The Mentor reviews the probation and decides Pass or Not pass. Only people already on this position are listed.")}</div>
      </div>
    </HireConfirmDialog>
  );
}

export type RejectOptions = { reason: string; keepInPool: boolean; notifyInterviewers: boolean };

export function RejectDialog({ names, unreviewed, onClose, onOk }: { names: string[]; unreviewed?: number; onClose: () => void; onOk: (o: RejectOptions) => void }) {
  const [r, setR] = React.useState("");
  const [notify, setNotify] = React.useState(false);
  return (
    <Dialog
      title={"Reject " + (names.length > 1 ? names.length + " candidates" : names[0]) + "?"}
      description={unreviewed ? unreviewed + " of these candidates have not been reviewed by a person. Their only negative signal is the AI match." : "Each rejection is written to the candidate history with your name."}
      onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" disabled={!r} onClick={() => onOk({ reason: r, keepInPool: false, notifyInterviewers: notify })}>Reject</Button></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Select label="Reason (required)" value={r} onChange={(e) => setR(e.target.value)} options={[{ value: "", label: "Choose a reason" }, "Skills do not match", "Experience level", "Salary expectation", "Candidate withdrew", "Position filled", "Other"]} />
        {/* Talent Pool is deferred: the option stays visible but can't be chosen yet. */}
        <Checkbox checked={false} disabled label={<>Keep in Talent pool for future positions <span style={{ fontSize: 12, color: "var(--muted)" }}>(Coming soon)</span></>} />
        <Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} label="Notify interviewers of canceled upcoming interviews" />
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Rejection emails are not sent automatically. Undo is available for 10 minutes.</div>
      </div>
    </Dialog>
  );
}

/** BR-INT-12: moving a candidate who still has upcoming interviews asks what to do with them. */
export function MoveWithSessionsDialog({ name, to, sessions, onClose, onOk }: { name: string; to: string; sessions: { when: string; round: string }[]; onClose: () => void; onOk: (o: { cancelUpcoming: boolean; notifyInterviewers: boolean }) => void }) {
  const [cancel, setCancel] = React.useState(true);
  const [notify, setNotify] = React.useState(false);
  return (
    <Dialog
      title={"Move " + name + " to " + to + "?"}
      description={name + " has " + sessions.length + " upcoming interview" + (sessions.length > 1 ? "s" : "") + ". Choose what happens to " + (sessions.length > 1 ? "them" : "it") + "."}
      onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onOk({ cancelUpcoming: cancel, notifyInterviewers: cancel && notify })}>Move</Button></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{sessions.map((x, i) => <li key={i}>{x.round} · {x.when}</li>)}</ul>
        <Radio name="mv-sessions" checked={!cancel} onChange={() => setCancel(false)} label="Keep the upcoming interviews" />
        <Radio name="mv-sessions" checked={cancel} onChange={() => setCancel(true)} label="Cancel the upcoming interviews" />
        {cancel && <Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} label="Notify interviewers" />}
      </div>
    </Dialog>
  );
}

export type CloseBlocker = { id: string; name: string; stage: string };

/**
 * BR-06-13: close is refused while candidates are in an offer/probation stage;
 * the server returns them and they are listed here. Link revoking and moving
 * candidates to the Talent pool are not built yet, so they are not offered.
 */
export function CloseJobDialog({ job, blocking, busy, onClose, onOk }: { job: Job; blocking?: CloseBlocker[]; busy?: boolean; onClose: () => void; onOk: (o: { notifyInterviewers: boolean }) => void }) {
  const [notify, setNotify] = React.useState(false);
  const blocked = !!blocking && blocking.length > 0;
  return (
    <Dialog
      title={"Close " + job.title + "?"}
      description={job.candidates + " candidate" + (job.candidates === 1 ? " is" : "s are") + " in this position. Their current stage is recorded when it closes. " + job.hired + " of " + job.headcount + " positions are filled."}
      onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" disabled={blocked || busy} onClick={() => onOk({ notifyInterviewers: notify })}>Close position</Button></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {blocked && (
          <Banner tone="warning" title="Resolve these candidates first">
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{blocking!.map((b) => <li key={b.id}>{b.name} · {b.stage}</li>)}</ul>
            Move them to another stage or reject them, then close the position.
          </Banner>
        )}
        <Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} label="Notify interviewers of canceled upcoming interviews" />
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Upcoming interviews are canceled when the position closes. Moving candidates to the Talent pool is coming soon.</div>
      </div>
    </Dialog>
  );
}

/** AC-06-16: putting a position on hold or reopening it needs a reason. */
export function StatusReasonDialog({ job, to, busy, onClose, onOk }: { job: Job; to: "hold" | "reopen"; busy?: boolean; onClose: () => void; onOk: (o: { reason: string; notifyInterviewers: boolean }) => void }) {
  const [reason, setReason] = React.useState("");
  const [notify, setNotify] = React.useState(false);
  const trimmed = reason.trim();
  const err = trimmed.length > 1000 ? "Keep the reason under 1000 characters" : undefined;
  const hold = to === "hold";
  return (
    <Dialog
      title={(hold ? "Put " : "Reopen ") + job.title + (hold ? " on hold?" : "?")}
      description={hold ? "Upcoming interviews for this position are canceled. The reason is saved with the position." : "The position goes back to Open. The reason is saved with the position."}
      width={480}
      onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!trimmed || !!err || busy} onClick={() => onOk({ reason: trimmed, notifyInterviewers: hold && notify })}>{hold ? "Put on hold" : "Reopen position"}</Button></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Input label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} error={err} autoFocus />
        {hold && <Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} label="Notify interviewers of canceled upcoming interviews" />}
      </div>
    </Dialog>
  );
}

/** Recording Not pass on a probation needs a reason; it is saved to the candidate history and shown to the Mentor. */
export function NotPassReasonDialog({ name, sub, busy, onClose, onOk }: { name: string; sub: string; busy?: boolean; onClose: () => void; onOk: (reason: string) => void }) {
  const [reason, setReason] = React.useState("");
  const trimmed = reason.trim();
  const err = trimmed.length > 1000 ? "Keep the reason under 1000 characters" : undefined;
  return (
    <Dialog
      title={"Mark " + name + " as " + sub + "?"}
      description="The reason is saved to the candidate history. The Mentor can see it; the candidate cannot."
      width={480}
      onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" disabled={!trimmed || !!err || busy} onClick={() => onOk(trimmed)}>{sub}</Button></>}
    >
      <Input label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} error={err} autoFocus />
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

const toIso = (d: string | null) => { const m = d ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d) : null; return m ? `${m[3]}-${m[2]}-${m[1]}` : ""; };

export function DeadlineDialog({ job, onClose, onSave, title = "Edit deadline", confirmLabel = "Save deadline", busy }: { job: Job; onClose: () => void; onSave: (iso: string) => void; title?: string; confirmLabel?: string; busy?: boolean }) {
  const initial = toIso(job.deadline);
  const [v, setV] = React.useState(initial);
  const err = !v ? "Pick a deadline date" : undefined;
  return (
    <Dialog
      title={title} description={job.title} width={440} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!!err || v === initial || busy} onClick={() => onSave(v)}>{confirmLabel}</Button></>}
    >
      <Input label="Hiring deadline" type="date" value={v} onChange={(e) => setV(e.target.value)} error={err} autoFocus />
    </Dialog>
  );
}

export type BulkMovePlan = { kind: "sub" | "stage"; value: string; ids: number[] };

type BulkTarget = { key: string; kind: "sub" | "stage"; value: string; label: string; group: string; ok: (c: Candidate) => string | null };

/** Bulk move for candidates that share one stage; each target lists who is eligible and why others are skipped. */
export function BulkMoveDialog({ cands, stages, onClose, onOk }: { cands: Candidate[]; stages: Stage[]; onClose: () => void; onOk: (p: BulkMovePlan) => void }) {
  const cur = stages.find((s) => s.id === cands[0]?.stage);
  const i = cur ? stages.indexOf(cur) : -1;
  const base = (c: Candidate) => (c.st === "scoring" ? "still scoring" : c.st === "error" ? "scoring failed" : null);
  const targets: BulkTarget[] = [];
  if (cur) {
    cur.subs.forEach((sub) => targets.push({ key: "sub:" + sub, kind: "sub", value: sub, label: sub, group: "Result in " + cur.label, ok: (c) => (c.sub === sub ? "already " + sub : null) }));
    stages.forEach((s, j) => {
      if (j === i) return;
      const locked = s.id === "probation" || s.id === "hired" || !!s.probation;
      targets.push({
        key: "stage:" + s.id, kind: "stage", value: s.id, label: s.label, group: "Move to",
        ok: (c) => base(c) ?? (locked ? "hiring is done one at a time" : j < i ? (c.sub === cur.def ? null : `not at "${cur.def}"`) : j === i + 1 ? (c.sub === cur.pass ? null : `not "${cur.pass}" yet`) : `needs ${stages[j - 1].label} first`),
      });
    });
  }
  const [key, setKey] = React.useState("");
  const t = targets.find((x) => x.key === key);
  const rows = t ? cands.map((c) => ({ c, why: t.kind === "sub" ? (c.sub === t.value ? "already " + t.value : null) : t.ok(c) })) : [];
  const ok = rows.filter((r) => !r.why), skipped = rows.filter((r) => r.why);
  return (
    <Dialog
      title={`Move ${cands.length} candidates`}
      description={cur ? `All selected are in ${cur.label}. Only candidates valid for the chosen target move.` : undefined}
      onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!t || ok.length === 0} onClick={() => t && onOk({ kind: t.kind, value: t.value, ids: ok.map((r) => r.c.id) })}>{t ? `Move ${ok.length}` : "Move"}</Button></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Select label="Move to stage" value={key} onChange={(e) => setKey(e.target.value)}
          options={[{ value: "", label: "Choose a stage" }, ...targets.map((x) => ({ value: x.key, label: x.group + " · " + x.label }))]} />
        {t && <>
          <div style={{ fontSize: 13 }}>
            {ok.length} of {cands.length} will {t.kind === "sub" ? `be set to “${t.value}”` : `move to ${t.label}`}
            {t.kind === "stage" && ok.length > 0 && ` and start at “${stages.find((s) => s.id === t.value)?.def}”`}.
          </div>
          {ok.length > 0 && <div style={{ fontSize: 12, color: "var(--muted)" }}>{ok.map((r) => r.c.name).join(", ")}</div>}
          {skipped.length > 0 && <Banner tone="warning" icon="triangle-alert" title={`${skipped.length} skipped`}>
            {skipped.map((r) => <div key={r.c.id}>{r.c.name} — {r.why}</div>)}
          </Banner>}
        </>}
      </div>
    </Dialog>
  );
}

export function RemoveDialog({ names, onClose, onOk }: { names: string[]; onClose: () => void; onOk: (o: { notifyInterviewers: boolean }) => void }) {
  const [notify, setNotify] = React.useState(false);
  return (
    <Dialog
      title={"Remove " + (names.length > 1 ? names.length + " candidates" : names[0]) + " from this position?"}
      description="They are taken off this position's pipeline. Their CVs stay in the system and can be added to a position again."
      onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={() => onOk({ notifyInterviewers: notify })}>Remove</Button></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 13 }}>{names.join(", ")}</div>
        <Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} label="Notify interviewers of canceled upcoming interviews" />
      </div>
    </Dialog>
  );
}
