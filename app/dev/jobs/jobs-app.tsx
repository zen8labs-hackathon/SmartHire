"use client";

import * as React from "react";
import { JD, stageOf, type AttentionItem, type Candidate, type Job, type Notif, type Role, type RoleKey, type StageId } from "./data";
import { Badge, Banner, Button, EntityTabs, ShareEvaluationDialog, lsGet, lsSet, type EntityTab } from "./ext";
import { Shell, Toast, type ToastMsg } from "./shell";
import { JobsList, ST_TONE, visibleJobs } from "./list";
import { CandidatesTab, CandidateDrawer, type CandHandlers, type CandPreset } from "./candidates";
import { OverviewTab, UploadsTab } from "./overview";
import { DescriptionTab, PipelineTab, AccessTab } from "./tabs";
import {
  CloseJobDialog, CreateJobDialog, DuplicateDialog, HeadcountDialog, HireDialog, RejectDialog, UploadDialog, UploadTray,
  type CreateJobInput, type UploadBatch,
} from "./dialogs";

type Route = { page: "jobs" | "job"; id?: number | "pool"; tab?: string | null; upView?: string };
type Dlg =
  | { k: "create" } | { k: "upload"; dest?: number | "pool" | null } | { k: "dup" } | { k: "hire"; c: Candidate }
  | { k: "reject"; ids: number[]; clear?: () => void } | { k: "close"; job: Job } | { k: "hc" } | null;
type NavCtx = { ids: number[]; label: string; review?: boolean; done?: boolean } | null;

const ROLE_OPTS: [RoleKey, string][] = [["hr", "Chị Hiền · HR Generalist"], ["ch", "Anh Huy · Chapter Head"], ["rc", "Linh · Recruiter"], ["iv", "Anh Đức · Interviewer"]];
const HUY = "Trần Quang Huy";

export function JobsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [roleKey, setRoleKey] = React.useState<RoleKey>("hr");
  const user = JD.roles[roleKey] as Role;
  const [route, setRoute] = React.useState<Route>({ page: "jobs" });
  const [cands, setCands] = React.useState<Candidate[]>(() => JD.candidates as Candidate[]);
  const [att, setAtt] = React.useState<AttentionItem[]>(() => JD.attention as AttentionItem[]);
  const [jobs, setJobs] = React.useState<Job[]>(() => JD.jobs as Job[]);
  const [notifs, setNotifs] = React.useState<Notif[]>(() => JD.notifs as Notif[]);
  const [drawer, setDrawer] = React.useState<number | null>(null);
  const [navCtx, setNavCtx] = React.useState<NavCtx>(null);
  const [preset, setPreset] = React.useState<(CandPreset & { k: number }) | null>(null);
  const [dlg, setDlg] = React.useState<Dlg>(null);
  const [batch, setBatch] = React.useState<(UploadBatch & { key: number }) | null>(null);
  const [toast, setToast] = React.useState<ToastMsg>(null);
  const [view, setView] = React.useState("list");
  const [upViewS, setUpViewS] = React.useState("list");
  const [share, setShare] = React.useState<string | null>(null);
  const tRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    // Restore persisted route / open candidate after mount (localStorage is client-only).
    setRoute(lsGet<Route>("jb-route", { page: "jobs" }));
    const oc = lsGet<number | null>("jb-open-cand", null);
    if (oc != null) { setDrawer(oc); lsSet("jb-open-cand", null); }
  }, []);

  const nav = (r: Route) => { setRoute(r); lsSet("jb-route", r); };
  const go = (id: number | "pool", tab?: string) =>
    nav({ page: "job", id, tab: tab === "attention" ? "uploads" : tab || null, upView: tab === "attention" ? "attention" : undefined });
  const home = () => nav({ page: "jobs" });
  const say = (title: React.ReactNode, body?: React.ReactNode, action?: { label: string; fn: () => void }, icon?: string) => {
    setToast({ title, body, action, icon });
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(() => setToast(null), 6000);
  };

  const visible = visibleJobs(user, jobs);
  const isPool = route.page === "job" && route.id === "pool";
  const job: Job | undefined = route.page !== "job" ? undefined
    : isPool ? ({ ...JD.pool, status: "Open" } as unknown as Job) : visible.find((j) => j.id === route.id);

  React.useEffect(() => {
    if (route.page === "job" && !job) home();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleKey]);

  const myCands = user.assigned ? cands.filter((c) => user.assigned!.includes(c.id)) : cands;
  const myNotifs = notifs.filter((n) => n.roles.includes(user.key));

  const onNotif = (n: Notif | null, kind?: "readall") => {
    if (kind === "readall") { setNotifs((ns) => ns.map((x) => ({ ...x, unread: false }))); return; }
    if (!n) return;
    setNotifs((ns) => ns.map((x) => (x.id === n.id ? { ...x, unread: false } : x)));
    const [id, tab, cand] = n.href;
    if (!visible.some((j) => j.id === id)) { say("No access", "You cannot open this position.", undefined, "lock"); return; }
    go(id, tab);
    if (cand != null) setDrawer(cand);
  };

  const updJob = (id: number, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...p } : j)));
  const upd = (id: number, p: Partial<Candidate>) => setCands((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));

  const createJob = (v: CreateJobInput) => {
    const id = Math.max(...jobs.map((j) => j.id)) + 1;
    const base: Job = {
      id, title: "", chapter: v.chapter, type: v.type, headcount: v.headcount, level: "—", status: "Draft", hired: 0, deadline: null,
      candidates: 0, attention: 0, owner: user.name, updated: "29/09/2026", fresh: true,
    };
    setDlg(null);
    if (v.blank || !v.file) {
      setJobs((js) => [{ ...base, title: "Untitled position", blank: true, criteria: [], draftNote: "Blank form" }, ...js]);
      go(id, "jd");
      return;
    }
    setJobs((js) => [{ ...base, title: "New position · " + v.file, file: v.file, processing: "upload", draftNote: "Extracting JD" }, ...js]);
    go(id, "jd");
    setTimeout(() => updJob(id, { processing: "extract" }), 1300);
    setTimeout(() => updJob(id, { processing: "llm" }), 2800);
    setTimeout(() => {
      updJob(id, {
        processing: null, title: "Cloud Engineer (AWS)", level: "Mid–Senior", draftNote: "Review AI-filled fields",
        criteria: [
          { id: "c1", req: "3+ years AWS (EC2, ECS, RDS)", imp: "Must have", origin: "AI" },
          { id: "c2", req: "Infrastructure as code with Terraform", imp: "Must have", origin: "AI" },
          { id: "c3", req: "CI/CD pipelines (GitHub Actions or GitLab)", imp: "Must have", origin: "AI" },
          { id: "c4", req: "Kubernetes in production", imp: "Nice to have", origin: "AI" },
          { id: "c5", req: "AWS certification", imp: "Bonus", origin: "AI" },
          { id: "c6", req: "Male, under 30", imp: "Nice to have", origin: "AI" },
        ],
      });
      setNotifs((ns) => [{ id: "n" + Date.now(), title: "JD processed · Cloud Engineer (AWS)", body: "19 of 25 fields and 6 criteria filled. Review before opening the position.", time: "now", unread: true, action: "Review draft", href: [id, "jd"], roles: ["hr", "ch"] }, ...ns]);
      say("JD processed", "19 of 25 fields filled. Review and edit before opening the job.", { label: "Review draft", fn: () => go(id, "jd") }, "sparkles");
    }, 4800);
  };

  const h: CandHandlers = {
    onSub: (c, sub) => {
      upd(c.id, { sub });
      const s = stageOf(c.stage);
      say(`${c.name} · ${s.label} set to ${sub}`, sub === s.pass ? "Next stage is now unlocked." : undefined, undefined, "circle-check");
    },
    onMove: (c, to: StageId) => {
      const s = stageOf(to);
      const fwd = JD.stages.findIndex((x) => x.id === to) > JD.stages.findIndex((x) => x.id === c.stage);
      if (!user.canDecide && fwd) { say(`Proposal sent to ${HUY}`, `Recruiters propose moves; the Chapter Head decides. ${c.name} → ${s.label}`, undefined, "send"); return; }
      if (to === "probation") { setDlg({ k: "hire", c }); return; }
      if (to === "hired") { upd(c.id, { stage: "hired", sub: "Official", days: 0 }); say(`${c.name} moved to Official`, undefined, undefined, "badge-check"); return; }
      const old = { stage: c.stage, sub: c.sub, days: c.days };
      upd(c.id, { stage: to, sub: s.def, days: 0 });
      say(`${c.name} moved to ${s.label}`, `Starts at step “${s.def}”.` + (s.schedule ? " Scheduling is available for this stage." : ""), { label: "Undo", fn: () => upd(c.id, old) }, "arrow-right");
    },
    onReject: (c) => setDlg({ k: "reject", ids: [c.id] }),
    onBulk: (ids, kind, clear) => {
      if (kind === "reject") setDlg({ k: "reject", ids, clear });
      else say("Choose a stage", "Only stages valid for every selected candidate are offered.");
    },
    onAttention: (a, x) => {
      if (x === "Compare") setDlg({ k: "dup" });
      else if (x === "Open candidate") { if (a.cand != null) setDrawer(a.cand); }
      else if (x === "Rescore") {
        const cid = a.cand;
        if (cid != null) upd(cid, { st: "scoring" });
        setAtt((xs) => xs.filter((y) => y.id !== a.id));
        if (cid != null) setTimeout(() => upd(cid, { st: "done", band: "good", score: 66, ai: 70, formula: 60 }), 2500);
        say("Rescoring Đặng Thu Trang", undefined, undefined, "sparkles");
      } else if (x === "Send reminder") say(`Reminder sent to ${HUY}`, "Notification links straight to the interview notes form.", undefined, "send");
      else if (x === "Retry") { setAtt((xs) => xs.filter((y) => y.id !== a.id)); say("nguyen_thanh_cv.docx queued again", undefined, undefined, "rotate-ccw"); }
      else say(x, "Opens the " + x.toLowerCase() + " form for " + (a.file || "this file") + ".");
    },
  };

  const openCand = (id: number, ids: number[], label: string, review?: boolean) => { setDrawer(id); setNavCtx({ ids, label, review }); };
  const dc = drawer != null ? cands.find((c) => c.id === drawer) || null : null;

  let crumbs: React.ReactNode, title: React.ReactNode, meta: React.ReactNode = null, actions: React.ReactNode = null, body: React.ReactNode;

  if (!job) {
    title = "Position Management";
    crumbs = <span>{user.allJobs ? "All chapters" : user.chapter ? `Chapter ${user.chapter}` : "Shared with you"}</span>;
    actions = <>
      {user.key !== "iv" && <Button variant="secondary" icon="upload" onClick={() => setDlg({ k: "upload", dest: null })}>Upload CVs</Button>}
      {user.canCreate && <Button icon="plus" onClick={() => setDlg({ k: "create" })}>Open new position</Button>}
    </>;
    body = <JobsList user={user} go={(id, tab, cand) => { go(id as number | "pool", tab ?? undefined); if (cand != null) setDrawer(cand); }}
      onCreate={() => setDlg({ k: "create" })} onUpload={(id) => setDlg({ k: "upload", dest: id as number | "pool" })} onCloseJob={(j) => setDlg({ k: "close", job: j })} jobs={visible} />;
  } else {
    const pool = JD.pool;
    const tabs: EntityTab[] = isPool
      ? [{ id: "candidates", label: "Candidates", count: pool.candidates }, { id: "uploads", label: "Uploads & processing", count: pool.attention, warn: true }]
      : user.key === "iv"
        ? [{ id: "candidates", label: "My interviews", count: myCands.length }, { id: "jd", label: "Description & criteria" }]
        : [
          { id: "overview", label: "Overview" },
          { id: "candidates", label: "Candidates", count: job.id === 142 ? cands.length : job.candidates },
          { id: "uploads", label: "Uploads & processing", count: job.id === 142 ? att.length : job.attention, warn: (job.id === 142 ? att.length : job.attention) > 0 },
          { id: "jd", label: "Description & criteria" },
          { id: "pipeline", label: "Pipeline" },
          ...(user.key !== "rc" ? [{ id: "access", label: "Access" }] : []),
        ];
    const tab = tabs.some((t) => t.id === route.tab) ? route.tab! : tabs[0].id;
    const upAtt = isPool ? att.slice(0, 3) : att;
    const upView = route.upView || (upAtt.length ? "attention" : "history");
    const canHc = (user.key === "hr" || user.key === "ch") && job.status !== "Closed";
    const [tone, icon] = ST_TONE[job.status] || ["neutral", "circle"];

    title = job.title;
    crumbs = <button type="button" className="jb-textlink" onClick={home}>← Position Management</button>;
    meta = isPool ? <span className="jb-meta">{pool.note}</span> : <>
      <Badge tone={tone} icon={icon}>{job.status}</Badge>
      <span className="jb-meta jb-metarow">#{job.id} · {job.chapter} · {job.level} · {job.type}</span>
      <span className="jb-meta">{job.hired} of {job.headcount} hired{canHc && <> · <button type="button" className="jb-textlink" onClick={() => setDlg({ k: "hc" })}>Edit</button></>}</span>
      {job.deadline && <span className="jb-meta">Deadline {job.deadline}</span>}
    </>;
    actions = <>
      {user.key !== "iv" && <Button variant="secondary" icon="upload" onClick={() => setDlg({ k: "upload", dest: isPool ? "pool" : job.id })}>Upload CVs</Button>}
      {!isPool && user.key === "hr" && job.status !== "Draft" && job.status !== "Closed" && <Button variant="secondary" icon="archive" onClick={() => setDlg({ k: "close", job })}>Close position</Button>}
      {!isPool && job.status === "Draft" && user.canCreate && <>
        <Button variant="secondary" icon="send" disabled={!!job.processing} onClick={() => { updJob(job.id, { draftNote: "Criteria sent to Chapter Head for review", reviewRequested: true }); say("Review requested", `Chapter Head ${job.chapter} was asked to check the criteria.`, undefined, "send"); }}>Request review</Button>
        <Button icon="circle-check" disabled={!!job.processing} onClick={() => { updJob(job.id, { status: "Open", fresh: false, draftNote: null }); say(`${job.title} is open`, "You can now upload CVs.", undefined, "briefcase"); }}>Open position</Button>
      </>}
    </>;

    const tabCands = isPool ? cands.slice(0, 6).map((c) => ({ ...c, stage: "cv" as StageId, sub: "New" })) : user.key === "iv" ? myCands : cands;
    body = (
      <div style={{ padding: "0 24px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
        <EntityTabs tabs={tabs} value={tab} onChange={(v) => { setPreset(null); nav({ ...route, tab: v, upView: undefined }); }} />
        {!isPool && job.id !== 142 && !["jd", "pipeline", "access"].includes(tab) && (
          <Banner tone="info" icon="info">Sample data shown for position #142 · Senior Web Developer.</Banner>
        )}
        {isPool && tab === "candidates" && (
          <Banner tone="info" icon="archive" title="Talent pool">Candidates kept after a position closed or uploaded without a position. Add them to an open position with “Move to position…”; their history stays attached.</Banner>
        )}
        {tab === "candidates" && <CandidatesTab key={preset?.k} user={user} cands={tabCands} h={h} view={view} setView={setView} isPool={isPool} open={openCand} preset={preset || undefined} />}
        {tab === "overview" && <OverviewTab job={job} cands={cands} att={att} user={user}
          onFilter={(p) => { setPreset({ ...p, k: Date.now() }); nav({ ...route, tab: "candidates", upView: undefined }); }}
          onTab={(t, sub) => nav({ ...route, tab: t, upView: sub })} />}
        {tab === "uploads" && <UploadsTab h={h} att={upAtt} resolve={(id) => setAtt((xs) => xs.filter((x) => x.id !== id))} admin={user.key === "hr"}
          view={upView} setView={(v) => { setUpViewS(v); nav({ ...route, upView: v }); }} isPool={isPool}
          onOpenCand={(f) => { if (f.candId != null) setDrawer(f.candId); else say(f.file, f.did); }} />}
        {tab === "jd" && <DescriptionTab job={job} user={user} onHeadcount={() => setDlg({ k: "hc" })} onRescore={() => {
          const ids = cands.filter((c) => c.st === "done").map((c) => c.id);
          setCands((cs) => cs.map((c) => (ids.includes(c.id) ? { ...c, st: "scoring" } : c)));
          setTimeout(() => setCands((cs) => cs.map((c) => (ids.includes(c.id) && c.id !== 6 ? { ...c, st: "done" } : c))), 2600);
          say("Rescoring 18 candidates", "Bands update as each finishes. Manual edits are kept.", undefined, "sparkles");
        }} />}
        {tab === "pipeline" && <PipelineTab user={user} />}
        {tab === "access" && <AccessTab user={user} />}
      </div>
    );
  }
  void upViewS;

  const rejectIds = dlg?.k === "reject" ? dlg.ids : [];
  return (
    <Shell embedded={embedded} active="jobs" user={user} crumbs={crumbs} title={title} meta={meta} actions={actions} onHome={home} notifs={myNotifs} onNotif={onNotif}>
      {body}

      <CandidateDrawer key={dc?.id ?? "none"} c={dc} user={user} h={h} onClose={() => { setDrawer(null); setNavCtx(null); }}
        onRescore={(c) => h.onAttention({ id: "a5", cand: c.id }, "Rescore")}
        onShare={() => dc && setShare(dc.name)}
        onSubmitNotes={(c, v) => {
          upd(c.id, { ivDone: true, ivNote: v, noNote: false });
          setAtt((xs) => xs.filter((a) => !(a.kind === "note" && a.cand === c.id)));
          say("Interview notes submitted", "The AI match and other interviewers' notes are now visible to you.", undefined, "circle-check");
        }} />
      {share && <ShareEvaluationDialog name={share} onClose={() => setShare(null)} />}

      {dlg?.k === "hc" && job && <HeadcountDialog job={job} onClose={() => setDlg(null)} onSave={(n) => {
        updJob(job.id, { headcount: n }); setDlg(null);
        say("Headcount updated", `${job.title} now needs ${n} hire${n === 1 ? "" : "s"} · ${n - job.hired} open.`, undefined, "users");
      }} />}
      {dlg?.k === "create" && <CreateJobDialog onClose={() => setDlg(null)} onSubmit={createJob} defaultChapter={user.chapter || "Infra"} lockChapter={!!user.chapter} />}
      {dlg?.k === "upload" && <UploadDialog dest={dlg.dest} jobs={visible} onClose={() => setDlg(null)} onStart={(b) => { setDlg(null); setBatch({ ...b, key: Date.now() }); }} />}
      {batch && <UploadTray key={batch.key} batch={batch} onClose={() => setBatch(null)}
        onOpen={() => go(batch.to === "pool" ? "pool" : Number(batch.to), "attention")}
        onDone={() => {
          setNotifs((ns) => [{ id: "n" + Date.now(), title: "Upload from 14:20 finished", body: "25 CVs · 21 done · 2 existing candidates · 2 need attention", time: "now", unread: true, action: "Open Needs attention", href: [142, "attention"], roles: ["hr", "rc"] }, ...ns]);
          say("Batch from 14:20 finished", "25 CVs: 21 parsed, 2 existing candidates, 2 need attention.", { label: "Open Needs attention", fn: () => go(batch.to === "pool" ? "pool" : Number(batch.to), "attention") }, "bell");
        }} />}
      {dlg?.k === "dup" && <DuplicateDialog onClose={() => setDlg(null)} onResolve={(m) => {
        setAtt((xs) => xs.filter((a) => a.kind !== "dup" && a.kind !== "suspected"));
        setDlg(null);
        if (m === "merge") say("Merged into Lê Minh Châu", "New application added; previous application from 03/2025 is linked.", undefined, "git-merge");
        else say("New candidate created", undefined, undefined, "git-merge");
      }} />}
      {dlg?.k === "hire" && job && <HireDialog c={dlg.c} job={job} onClose={() => setDlg(null)} onOk={() => {
        upd(dlg.c.id, { stage: "probation", sub: "Awaiting start" }); setDlg(null);
        say(`${dlg.c.name} hired`, undefined, undefined, "badge-check");
      }} />}
      {dlg?.k === "reject" && <RejectDialog names={cands.filter((c) => rejectIds.includes(c.id)).map((c) => c.name)}
        unreviewed={cands.filter((c) => rejectIds.includes(c.id) && !c.notes).length}
        onClose={() => setDlg(null)} onOk={() => {
          setCands((cs) => cs.filter((c) => !rejectIds.includes(c.id)));
          dlg.clear?.();
          if (navCtx?.review && drawer != null) {
            const rest = navCtx.ids.filter((id) => !rejectIds.includes(id) && id !== drawer);
            if (rest.length) setDrawer(rest[0]); else { setNavCtx({ ...navCtx, done: true }); setDrawer(null); }
          } else setDrawer(null);
          setDlg(null);
          say(`${rejectIds.length} rejected`, "Kept in Talent pool.", { label: "Undo", fn: () => setCands(JD.candidates as Candidate[]) }, "x");
        }} />}
      {dlg?.k === "close" && <CloseJobDialog job={dlg.job} onClose={() => setDlg(null)} onOk={() => {
        updJob(dlg.job.id, { status: "Closed" }); setDlg(null); home();
        say(`${dlg.job.title} closed`, `${dlg.job.candidates} candidates moved to Talent pool.`, undefined, "archive");
      }} />}
      <Toast t={toast} onClose={() => setToast(null)} />

      <div className="jb-roleswitch" style={{ position: "fixed", left: 16, bottom: 16, zIndex: 60, background: "var(--surface, #fff)", border: "1px solid var(--border, #ddd)", borderRadius: 8, padding: "8px 10px", boxShadow: "0 4px 16px rgba(0,0,0,.08)", fontSize: 12 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          View as
          <select className="sh-select" value={roleKey} onChange={(e) => setRoleKey(e.target.value as RoleKey)}>
            {ROLE_OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </div>
    </Shell>
  );
}
