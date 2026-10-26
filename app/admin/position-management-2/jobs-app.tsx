"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { STAGES, stageOf, type AttentionItem, type Batch, type BatchFile, type Candidate, type Job, type Role, type Stage } from "./data";
import { Badge, Banner, Button, Dialog, EntityTabs, Icon, Menu, ShareEvaluationDialog, lsGet, lsSet, type EntityTab } from "./ext";
import { MigrateWizard } from "./migrate-wizard";
import { Pop, Shell, Toast, type ToastMsg } from "./shell";
import { JobsList, ST_TONE, visibleJobs } from "./list";
import { createPosition, fetchChapters, fetchPipelineChoices, type PipelineChoice, changeUploadStatus, fetchPositionCandidates, fetchPositionDescription, fetchUploadHistory, retryUploads, fetchPositions, fetchMyInterviews, fetchSchedules, markNoShow, type MyInterview, toCandidate, toStages, positionToJob, reprocessPosition, rescoreCandidate, rescorePosition, saveCriteria, transitionPosition, updatePosition, updateCandidateStage, setOfferAccepted, fetchPositionMembers, changeMentor, extendProbation, undoReject, removeCandidate, TransitionBlockedError, type ChapterInfo, type PositionTransitionKind } from "./api";
import { CandidatesTab, CandidateDrawer, type CandHandlers, type CandPreset } from "./candidates";
import { UploadsTab } from "./overview";
import { InterviewsBanner, MyInterviewsTab } from "./my-interviews";
// eslint-disable-next-line no-restricted-imports -- TODO(S9): move into the -2 tree before the legacy UI is deleted
import { ManualEntryFromUploadModal } from "@/components/admin/jd/manual-entry-from-upload-modal";
import type { FileUploadRow } from "@/lib/db/upload-history";
import { DescriptionTab, PipelineTab, AccessTab } from "./tabs";
import {
  ApplicationsDialog, BulkMoveDialog, CloseJobDialog, CreateJobDialog, DeadlineDialog, HeadcountDialog, HireDialog, MoveWithSessionsDialog, NotPassReasonDialog, RejectDialog, RemoveDialog, StatusReasonDialog, UploadDialog, UploadTray, type CloseBlocker,
  type CreateJobInput, type UploadBatch,
} from "./dialogs";

type Route = { page: "jobs" | "job"; id?: number | "pool"; tab?: string | null; upView?: string };
const LEGACY_TIP = "Vị trí này vẫn dùng cấu trúc cũ. Hãy chuyển sang cấu trúc mới trước khi thay đổi.";

type Dlg =
  | { k: "create" } | { k: "upload"; dest?: number | "pool" | null } | { k: "apps"; target: string; fileId: string; file: string } | { k: "manual"; f: BatchFile; target: string } | { k: "hire"; c: Candidate; to: string } | { k: "movesess"; c: Candidate; to: string; sessions: { when: string; round: string }[] }
  | { k: "notpass"; c: Candidate; sub: string } | { k: "reject"; ids: number[]; clear?: () => void } | { k: "remove"; ids: number[]; clear?: () => void } | { k: "bulkmove"; ids: number[]; clear?: () => void } | { k: "close"; job: Job; blocking?: CloseBlocker[]; busy?: boolean } | { k: "reason"; job: Job; to: "hold" | "reopen"; busy?: boolean } | { k: "hc" } | { k: "deadline" } | { k: "open"; job: Job } | { k: "jd" } | { k: "jdfile" } | { k: "pipeline" } | { k: "access" } | { k: "migrate" } | null;
type NavCtx = { ids: number[]; label: string; review?: boolean; done?: boolean } | null;

const IMP_LABEL: Record<string, string> = { must_have: "Must have", nice_to_have: "Nice to have", bonus: "Bonus" };

/** Derives the viewer's role from the real session (chapter API). Non-creating placeholder until it loads. */
function roleFromInfo(info: ChapterInfo | null): Role {
  if (info?.isHr) return { key: "hr", name: "You", role: "HR", allJobs: true, canCreate: true, canDecide: true, salary: true };
  if (info && info.headedChapterIds.length > 0) {
    const chapter = info.chapters.find((c) => c.id === info.headedChapterIds[0])?.name;
    return { key: "ch", name: "You", role: "Chapter Head", chapter, canCreate: true, canDecide: true, salary: true };
  }
  return { key: "rc", name: "You", role: "Recruiter", canCreate: false, canDecide: false, salary: false };
}

export function JobsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [chInfo, setChInfo] = React.useState<ChapterInfo | null>(null);
  const [pipelineChoices, setPipelineChoices] = React.useState<PipelineChoice[]>([]);
  const user = React.useMemo(() => roleFromInfo(chInfo), [chInfo]);
  const router = useRouter();
  const pathname = usePathname();
  const BASE = "/admin/position-management-2";
  const seg = pathname.startsWith(BASE + "/") ? decodeURIComponent(pathname.slice(BASE.length + 1).split("/")[0]) : "";
  const candSeg = pathname.startsWith(BASE + "/") ? decodeURIComponent(pathname.slice(BASE.length + 1).split("/")[1] ?? "") : "";
  const [routeState, setRoute] = React.useState<Route>({ page: "jobs" });
  const [cands, setCands] = React.useState<Candidate[]>([]);
  const [candsFor, setCandsFor] = React.useState<number | null>(null);
  const [bs, setBs] = React.useState<Batch[]>([]);
  const [histErr, setHistErr] = React.useState<string | null>(null);
  const [resolved, setResolved] = React.useState<string[]>([]);
  const [jobs, setJobs] = React.useState<Job[]>([]);
  const [pool, setPool] = React.useState<{ candidates: number; attention: number } | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [navCtx, setNavCtx] = React.useState<NavCtx>(null);
  const [preset, setPreset] = React.useState<(CandPreset & { k: number }) | null>(null);
  const [dlg, setDlg] = React.useState<Dlg>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [batch, setBatch] = React.useState<(UploadBatch & { key: number }) | null>(null);
  const [toast, setToast] = React.useState<ToastMsg>(null);
  const [view, setView] = React.useState("list");
  const [upViewS, setUpViewS] = React.useState("list");
  const [share, setShare] = React.useState<string | null>(null);
  const tRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const idMap = React.useRef(new Map<string, number>());
  const uuidMap = React.useRef(new Map<number, string>());
  const idFor = React.useCallback((uuid: string) => {
    let id = idMap.current.get(uuid);
    if (id == null) { id = idMap.current.size + 1; idMap.current.set(uuid, id); uuidMap.current.set(id, uuid); }
    return id;
  }, []);
  const candIdMap = React.useRef(new Map<string, number>());
  const candUuidMap = React.useRef(new Map<number, string>());
  // The open candidate lives in the URL: /admin/position-management-2/<position>/<candidate>.
  const drawer: number | null = candSeg ? candIdMap.current.get(candSeg) ?? null : null;
  const setDrawer = (id: number | null, jobSeg: string = seg) => {
    const u = id != null ? candUuidMap.current.get(id) : undefined;
    const url = !jobSeg ? BASE : u ? `${BASE}/${jobSeg}/${u}` : `${BASE}/${jobSeg}`;
    if (drawer != null && id != null) router.replace(url); else router.push(url);
  };
  const [mine, setMine] = React.useState<MyInterview[]>([]);
  const [stages, setStages] = React.useState<Stage[]>(STAGES);
  const [creating, setCreating] = React.useState(false);
  const [createErr, setCreateErr] = React.useState<string | null>(null);
  const reload = React.useCallback((signal?: AbortSignal) =>
    fetchPositions(signal, idFor)
      .then((r) => { setJobs(r.jobs); setPool(r.pool); setLoaded(true); })
      .catch((e) => { if (!signal?.aborted) console.error(e); }), [idFor]);

  React.useEffect(() => {
    // Load the live position list and the viewer's chapter scope.
    const ac = new AbortController();
    void reload(ac.signal);
    fetchChapters(ac.signal).then(setChInfo).catch((e) => { if (!ac.signal.aborted) console.error(e); });
    fetchPipelineChoices(ac.signal).then(setPipelineChoices).catch((e) => { if (!ac.signal.aborted) console.error(e); });
    fetchMyInterviews(ac.signal).then(setMine).catch((e) => { if (!ac.signal.aborted) console.error(e); });
    return () => ac.abort();
  }, [reload]);
  // Seat state (submitted / overdue / no-show) changes server-side after an action.
  const reloadMine = React.useCallback(() => { fetchMyInterviews().then(setMine).catch((e) => console.error(e)); }, []);

  const anyProcessing = jobs.some((j) => j.processing);
  React.useEffect(() => {
    if (!anyProcessing) return;
    const t = setInterval(() => { void reload(); }, 4000);
    return () => clearInterval(t);
  }, [anyProcessing, reload]);

  React.useEffect(() => {
    // Restore persisted route / open candidate after mount (localStorage is client-only).
    { const r = lsGet<Route>("jb-route", { page: "jobs" }); setRoute({ page: "jobs", tab: r.tab, upView: r.upView }); }
    const oc = lsGet<number | null>("jb-open-cand", null);
    if (oc != null) { setDrawer(oc); lsSet("jb-open-cand", null); }
  }, []);

  const route: Route = seg
    ? { ...routeState, page: "job", id: seg === "pool" ? "pool" : idFor(seg) }
    : { ...routeState, page: "jobs", id: undefined };
  const nav = (r: Route) => {
    setRoute(r); lsSet("jb-route", r);
    if (r.page === "job" && r.id != null) {
      const target = r.id === "pool" ? "pool" : uuidMap.current.get(r.id);
      if (target && target !== seg) router.push(`${BASE}/${target}`);
    } else if (seg) router.push(BASE);
  };
  const go = (id: number | "pool", tab?: string) => {
    if (user.key !== "iv" && (tab === "jd" || tab === "pipeline" || (tab === "access" && user.key !== "rc"))) {
      setDlg({ k: tab });
      tab = undefined;
    }
    nav({ page: "job", id, tab: tab === "attention" ? "uploads" : tab || null, upView: tab === "attention" ? "attention" : undefined });
  };
  const home = () => nav({ page: "jobs" });
  const legacyBlocked = (j: Job | undefined) => {
    if (!j?.legacy) return false;
    say("Cấu trúc cũ", LEGACY_TIP, undefined, "archive");
    return true;
  };
  const say = (title: React.ReactNode, body?: React.ReactNode, action?: { label: string; fn: () => void }, icon?: string) => {
    setToast({ title, body, action, icon });
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(() => setToast(null), 6000);
  };

  const visible = visibleJobs(user, jobs);
  const isPool = route.page === "job" && route.id === "pool";
  const job: Job | undefined = route.page !== "job" ? undefined
    : isPool ? (pool ? ({ id: 0, title: "Talent pool", chapter: "—", level: "—", type: "—", status: "Open", headcount: 0, hired: 0, deadline: null, candidates: pool.candidates, attention: pool.attention, owner: "—", updated: "" } as Job) : undefined) : visible.find((j) => j.id === route.id);

  const upTarget = job ? (isPool ? "pool" : uuidMap.current.get(job.id)) : undefined;
  const loadHist = React.useCallback(async (signal?: AbortSignal) => {
    if (!upTarget) return;
    try { setBs(await fetchUploadHistory(upTarget, signal)); setHistErr(null); }
    catch (e) { if (!signal?.aborted) setHistErr(e instanceof Error ? e.message : "Could not load upload history."); }
  }, [upTarget]);
  React.useEffect(() => {
    setBs([]);
    setResolved(lsGet<string[]>("jb-resolved-uploads:" + (upTarget ?? ""), []));
    const ac = new AbortController();
    void loadHist(ac.signal);
    return () => ac.abort();
  }, [upTarget, loadHist]);
  const histBusy = bs.some((b) => b.files.some((f) => f.inProgress));
  React.useEffect(() => {
    if (!histBusy) return;
    const t = setInterval(() => { void loadHist(); }, 4000);
    return () => clearInterval(t);
  }, [histBusy, loadHist]);
  const resolveUp = (id: string) => setResolved((xs) => { const n = [...xs, id]; lsSet("jb-resolved-uploads:" + (upTarget ?? ""), n); return n; });
  const att: AttentionItem[] = React.useMemo(() => {
    const out: AttentionItem[] = [];
    for (const b of bs) for (const f of b.files) {
      if (!f.id || resolved.includes(f.id)) continue;
      if (f.kind === "failed") out.push({ id: f.id, group: "Failed uploads", kind: "failed", fs: "error", tech: f.errorCode ? `${f.errorStage ?? "error"} · ${f.errorCode}` : undefined, file: f.file, title: "Could not read this CV", detail: f.did, actions: ["Retry", "Enter manually"] });
      else if (f.kind === "dup_job") out.push({ id: f.id, group: "Already applied", kind: "dup_job", fs: "existing", file: f.file, title: f.cand ?? "Existing candidate", detail: "Already applied to this position", actions: ["View applications"] });
    }
    return out;
  }, [bs, resolved]);

  const critJobId = job && !isPool ? job.id : null;
  const critProc = job?.processing ?? null;
  React.useEffect(() => {
    const uuid = critJobId != null ? uuidMap.current.get(critJobId) : undefined;
    if (!uuid || critProc) return;
    let live = true;
    void fetch(`/api/admin/job-descriptions/${uuid}/requirements`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { requirements?: { id: string; requirement: string; importance: string; origin: string }[] } | null) => {
        if (!live || !d?.requirements) return;
        const criteria = d.requirements.map((r) => ({ id: r.id, req: r.requirement, imp: IMP_LABEL[r.importance] ?? "Nice to have", origin: (r.origin === "manual" ? "HR" : "AI") as "AI" | "HR" }));
        setJobs((js) => js.map((j) => (j.id === critJobId ? { ...j, criteria } : j)));
      })
      .catch(() => {});
    return () => { live = false; };
  }, [critJobId, critProc]);

  const detailsLoaded = job?.details !== undefined;
  React.useEffect(() => {
    const uuid = critJobId != null ? uuidMap.current.get(critJobId) : undefined;
    if (!uuid || critProc || detailsLoaded) return;
    const ac = new AbortController();
    fetchPositionDescription(uuid, ac.signal)
      .then((d) => setJobs((js) => js.map((j) => (j.id === critJobId ? { ...j, details: d.details, chapters: d.chapters.map((c) => c.name) } : j))))
      .catch(() => {});
    return () => ac.abort();
  }, [critJobId, critProc, detailsLoaded]);

  React.useEffect(() => {
    const uuid = critJobId != null ? uuidMap.current.get(critJobId) : undefined;
    if (!uuid || critProc) return;
    setCands([]);
    setCandsFor(null);
    const ac = new AbortController();
    fetchPositionCandidates(uuid, { all: true }, ac.signal)
      .then((r) => {
        setCandsFor(critJobId);
        setStages(toStages(r.pipeline.stages));
        setCands(r.candidates.map((pc) => {
          let id = candIdMap.current.get(pc.id);
          if (id == null) { id = candIdMap.current.size + 1; candIdMap.current.set(pc.id, id); candUuidMap.current.set(id, pc.id); }
          return toCandidate(pc, id);
        }));
      })
      .catch(() => {});
    return () => ac.abort();
  }, [critJobId, critProc]);

  React.useEffect(() => {
    if (loaded && chInfo && route.page === "job" && !job) home();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, chInfo]);

  const liveCount = candsFor != null && candsFor === critJobId ? cands.length : job?.candidates;
  const myCands = user.assigned ? cands.filter((c) => user.assigned!.includes(c.id)) : cands;


  const updJob = (id: number, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...p } : j)));
  const upd = (id: number, p: Partial<Candidate>) => setCands((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));

  const createJob = async (v: CreateJobInput) => {
    setCreating(true);
    setCreateErr(null);
    try {
      const row = await createPosition({ chapterId: v.chapterId, type: v.type, headcount: v.headcount, pipelineId: v.pipelineId, people: v.people?.map((a) => ({ profileId: a.id, role: a.role })), file: v.blank ? null : v.file });
      const id = idFor(row.id);
      setJobs((js) => [positionToJob(row, id), ...js.filter((j) => j.id !== id)]);
      setDlg(null);
      go(id, "jd");
      if (row.processing) say("Extracting JD", "We'll notify you when the draft is ready to review.", undefined, "sparkles");
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Could not create the position.");
    } finally {
      setCreating(false);
    }
  };

  const fail = (title: string, e: unknown) => say(title, e instanceof Error ? e.message : undefined, undefined, "triangle-alert");

  /** Runs a status transition on the server, then refreshes the list. Returns true on success. */
  const transition = async (j: Job, to: PositionTransitionKind, opts: { notifyInterviewers?: boolean; reason?: string } = {}): Promise<boolean> => {
    const uuid = uuidMap.current.get(j.id);
    if (!uuid) return false;
    try {
      await transitionPosition(uuid, to, opts);
      await reload();
      return true;
    } catch (e) {
      // BR-06-13: keep the close dialog open and list who blocks it.
      if (e instanceof TransitionBlockedError && to === "close") {
        setDlg({ k: "close", job: j, blocking: e.blocking });
        return false;
      }
      fail("Could not update the position", e);
      return false;
    }
  };

  const retryJd = async (j: Job) => {
    const uuid = uuidMap.current.get(j.id);
    if (!uuid) return;
    try {
      await reprocessPosition(uuid);
      updJob(j.id, { processing: "extract", procError: null, attention: Math.max(0, j.attention - 1) });
      say("Retrying JD extraction", undefined, undefined, "sparkles");
    } catch (e) {
      say("Could not retry", e instanceof Error ? e.message : undefined, undefined, "triangle-alert");
    }
  };

  /**
   * Writes a stage/sub change to the API (throws on failure). The server only lets a
   * candidate leave a stage from its "passed" sub-stage, so a cross-stage move marks the
   * current stage passed first. Returns false for demo / unmapped data (local only).
   */
  const saveStage = async (c: Candidate, stageId: string, sub: string, cascade?: { cancelUpcoming: boolean; notifyInterviewers: boolean }, startDate?: string, mentorId?: string, reason?: string): Promise<boolean> => {
    const subId = stageOf(stageId, stages).subIds?.[sub];
    if (!c.caId || !subId) return false;
    if (stageId !== c.stage) {
      const cur = stageOf(c.stage, stages);
      const passId = cur.pass ? cur.subIds?.[cur.pass] : undefined;
      if (passId && c.sub !== cur.pass) await updateCandidateStage(c.caId, cur.id, passId);
    }
    await updateCandidateStage(c.caId, stageId, subId, reason, cascade?.cancelUpcoming ? cascade.notifyInterviewers : undefined, cascade?.cancelUpcoming, startDate, mentorId);
    return true;
  };

  /** Reverts a candidate (locally and on the server) to a previous stage/sub. */
  const revertStage = (c: Candidate, old: Partial<Candidate>) => {
    upd(c.id, old);
    const os = stageOf(old.stage ?? c.stage, stages);
    const oid = os.subIds?.[old.sub ?? c.sub];
    if (!c.caId || !oid) return;
    const caId = c.caId;
    // Stepping back a stage is only allowed onto its "passed" sub-stage; restore the exact sub after.
    const passId = os.id !== c.stage && os.pass ? os.subIds?.[os.pass] : undefined;
    void (async () => {
      if (passId) await updateCandidateStage(caId, os.id, passId);
      if (oid !== passId) await updateCandidateStage(caId, os.id, oid);
    })().catch((e) => fail("Could not undo", e));
  };

  /** Saves a stage/sub change to the API; reverts the optimistic update on failure. */
  const persistStage = async (c: Candidate, stageId: string, sub: string, old: Partial<Candidate>, msg: string, detail: string | undefined, icon: string, undoable = false, cascade?: { cancelUpcoming: boolean; notifyInterviewers: boolean }, startDate?: string, mentorId?: string, reason?: string) => {
    try {
      const saved = await saveStage(c, stageId, sub, cascade, startDate, mentorId, reason);
      say(msg, detail, undoable && saved ? { label: "Undo", fn: () => revertStage({ ...c, stage: stageId, sub }, old) } : undefined, icon);
    } catch (e) {
      upd(c.id, old);
      fail("Could not update the stage", e);
    }
  };

  const moveTo = (c: Candidate, to: string, cascade?: { cancelUpcoming: boolean; notifyInterviewers: boolean }) => {
    const s = stageOf(to, stages);
    const old = { stage: c.stage, sub: c.sub, days: c.days };
    upd(c.id, { stage: to, sub: s.def, days: 0 });
    const detail = cascade?.cancelUpcoming ? "Upcoming interviews were canceled." : `Starts at step “${s.def}”.` + (s.schedule ? " Scheduling is available for this stage." : "");
    void persistStage(c, to, s.def, old, `${c.name} moved to ${s.label}`, detail, "arrow-right", !cascade?.cancelUpcoming, cascade);
  };

  const h: CandHandlers = {
    onSub: (c, sub) => {
      const s = stageOf(c.stage, stages);
      if (s.probation && s.notPass?.includes(sub)) { setDlg({ k: "notpass", c, sub }); return; }
      const old = { sub: c.sub };
      upd(c.id, { sub });
      void persistStage(c, c.stage, sub, old, `${c.name} · ${s.label} set to ${sub}`, sub === s.pass ? "Next stage is now unlocked." : undefined, "circle-check");
    },
    loadMembers: async () => {
      const u = uuidMap.current.get(job?.id as number);
      return u ? await fetchPositionMembers(u) : [];
    },
    onChangeMentor: async (c, m, reason) => {
      if (!c.caId) return;
      try {
        await changeMentor(c.caId, m.id, reason);
        upd(c.id, { mentorId: m.id, mentorName: m.name });
        say("Mentor changed", `${c.name} · Mentor is now ${m.name}.`, undefined, "circle-check");
      } catch (e) { fail("Could not change the Mentor", e); }
    },
    onExtend: async (c, until, reason) => {
      if (!c.caId) return;
      try {
        await extendProbation(c.caId, until, reason);
        upd(c.id, { probationExtendedUntil: until, probationExtensionCount: (c.probationExtensionCount ?? 0) + 1 });
        say("Probation extended", `${c.name} · until ${until.split("-").reverse().join("/")}.`, undefined, "circle-check");
      } catch (e) { fail("Could not extend the probation", e); }
    },
    onOfferAccepted: (c) => {
      if (!c.caId) return void say("Cannot record acceptance", "This candidate has no application.", undefined, "triangle-alert");
      upd(c.id, { offerAccepted: true });
      setOfferAccepted(c.caId, true)
        .then(() => say("Acceptance recorded", `${c.name} accepted the offer.`, undefined, "circle-check"))
        .catch((e) => { upd(c.id, { offerAccepted: false }); fail("Could not record the acceptance", e); });
    },
    onMove: (c, to: string) => {
      const s = stageOf(to, stages);
      if (s.probation) { setDlg({ k: "hire", c, to }); return; }
      if (!c.caId) { moveTo(c, to); return; }
      // BR-INT-12: a candidate with upcoming interviews gets a keep/cancel popup first.
      void fetchSchedules(c.caId).then((rs) => {
        const now = Date.now();
        const up = rs.filter((r) => (r.status === "Scheduled" || r.status === "Confirmed") && new Date(String(r.scheduled_at)).getTime() > now)
          .sort((a, b) => new Date(String(a.scheduled_at)).getTime() - new Date(String(b.scheduled_at)).getTime());
        if (!up.length) { moveTo(c, to); return; }
        setDlg({ k: "movesess", c, to, sessions: up.map((r) => ({ round: String(r.round_label ?? "Interview"), when: new Date(String(r.scheduled_at)).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) })) });
      }).catch((e) => fail("Could not load interviews", e));
    },
    onReject: (c) => setDlg({ k: "reject", ids: [c.id] }),
    onBulk: (ids, kind, clear) => {
      if (kind === "reject") setDlg({ k: "reject", ids, clear });
      else if (kind === "remove") setDlg({ k: "remove", ids, clear });
      else if (new Set(cands.filter((c) => ids.includes(c.id)).map((c) => c.stage)).size > 1) say("Select one stage", "Bulk move works on candidates in the same stage. Filter by stage first.", undefined, "info");
      else setDlg({ k: "bulkmove", ids, clear });
    },
    onAttention: (a, x) => {
      const f = bs.flatMap((b) => b.files).find((y) => y.id === a.id);
      if (f && upTarget && x === "Retry") {
        void retryUploads(upTarget, [f.id!]).then((r) => {
          if (r[0]?.ok) say("Retry queued", f.file, undefined, "rotate-ccw"); else say("Retry failed", r[0]?.error ?? "Could not retry.", undefined, "triangle-alert");
          void loadHist();
        }).catch((e) => fail("Retry failed", e));
      }
      else if (f && upTarget && x === "Enter manually") setDlg({ k: "manual", f, target: upTarget });
      else if (f && upTarget && x === "View applications") setDlg({ k: "apps", target: upTarget, fileId: f.id!, file: f.file });
      else if (x === "Rescore") {
        const c = cands.find((y) => y.id === a.cand);
        if (!c?.caId) return void say("Cannot rescore", "This candidate has no application to score.", undefined, "triangle-alert");
        rescoreCandidate(c.caId).then(() => {
          upd(c.id, { st: "scoring" });
          say("Rescoring started", `${c.name} is being scored again. The match will update shortly.`, undefined, "rotate-ccw");
        }).catch((e) => fail("Rescore failed", e));
      }
      else if (x === "Open candidate") { if (a.cand != null) setDrawer(a.cand); }
      else say("Not available yet", "This action is not connected to real data yet.", undefined, "info");
    },
  };

  const openCand = (id: number, ids: number[], label: string, review?: boolean) => { setDrawer(id); setNavCtx({ ids, label, review }); };
  const dc = drawer != null ? cands.find((c) => c.id === drawer) || null : null;

  let subtitle: React.ReactNode = null, onBack: (() => void) | undefined, trail: { label: React.ReactNode; href?: string }[] = [{ label: "Position Management" }], crumbs: React.ReactNode, title: React.ReactNode, meta: React.ReactNode = null, actions: React.ReactNode = null, body: React.ReactNode, jdTab: React.ReactNode = null;

  if (!job) {
    title = "Position Management";
    subtitle = user.allJobs ? "All Chapter" : user.chapter ? `Chapter ${user.chapter}` : "Shared with you";
    actions = <>
      {user.key !== "iv" && <Button variant="secondary" icon="upload" onClick={() => setDlg({ k: "upload", dest: null })}>Upload CVs</Button>}
      {user.canCreate && <Button icon="plus" onClick={() => setDlg({ k: "create" })}>Open new position</Button>}
    </>;
    body = <>
      {mine.some((m) => m.upcoming || m.pendingEvaluation) && (
        <div style={{ padding: embedded ? "0 0 12px" : "0 24px 12px" }}>
          <InterviewsBanner items={mine} onOpen={() => router.push("/admin/calendar-2")} />
        </div>
      )}
      <JobsList user={user} pool={pool} go={(id, tab, cand) => { go(id as number | "pool", tab ?? undefined); if (cand != null) setDrawer(cand, id === "pool" ? "pool" : uuidMap.current.get(id as number) ?? seg); }}
      onCreate={() => setDlg({ k: "create" })} onUpload={(id) => legacyBlocked(id === "pool" ? undefined : visible.find((x) => x.id === id)) || setDlg({ k: "upload", dest: id as number | "pool" })} onCloseJob={(j) => legacyBlocked(j) || setDlg({ k: "close", job: j })} onRetry={(j) => void retryJd(j)} onHold={(j) => legacyBlocked(j) || setDlg({ k: "reason", job: j, to: "hold" })} onReopen={(j) => legacyBlocked(j) || setDlg({ k: "reason", job: j, to: "reopen" })} jobs={visible} chapters={chInfo?.chapters.map((c) => c.name)} />
    </>;
  } else {
    const jobUuid = uuidMap.current.get(job.id);
    const myHere = isPool || !jobUuid ? [] : mine.filter((m) => m.jobId === jobUuid);
    const tabs: EntityTab[] = isPool
      ? [{ id: "candidates", label: "Candidates", count: liveCount }, { id: "uploads", label: "Uploads & processing", count: job.attention, warn: true }]
      : user.key === "iv"
        ? [{ id: "candidates", label: "My interviews", count: myCands.length }, { id: "jd", label: "Description & criteria" }]
        : [
          { id: "overview", label: "Overview" },
          { id: "candidates", label: "Candidates", count: liveCount },
          { id: "uploads", label: "Uploads & processing", count: job.attention, warn: job.attention > 0 },
          ...(myHere.length ? [{ id: "mine", label: "My interviews", count: myHere.length, warn: myHere.some((m) => m.pendingEvaluation) }] : []),
        ];
    const tab = tabs.some((t) => t.id === route.tab) ? route.tab! : (tabs.find((t) => t.id === "candidates") || tabs[0]).id;
    const upAtt = att;
    const upView = route.upView || (upAtt.length ? "attention" : "history");
    const f = (fn: () => void) => () => { setSettingsOpen(false); fn(); };
    const lg = !isPool && !!job.legacy;
    const canHc = (user.key === "hr" || user.key === "ch") && job.status !== "Closed" && !lg;
    const [tone, icon] = ST_TONE[job.status] || ["neutral", "circle"];

    title = job.title;
    onBack = home;
    trail = [{ label: "Position Management", href: BASE }, { label: job.title }];
    meta = isPool ? <span className="jb-meta">CVs kept without a position</span> : <>
      <Badge tone={tone} icon={icon}>{job.status}</Badge>
      <span className="jb-meta jb-metarow">
        <span>#{job.id} · {job.chapter || "—"} · {job.level || "—"} · {job.type}</span>
        <span aria-hidden="true">·</span>
        <span className="jb-hcbtn" style={{ cursor: "default" }}><Icon name="users" size={12} />{job.hired}/{job.headcount} hired</span>
        {(job.deadline || canHc) && <><span aria-hidden="true">·</span><span>deadline {job.deadline ?? "—"}</span>{canHc && <button type="button" className="jb-dledit" aria-label="Edit deadline" title="Edit deadline" onClick={() => setDlg({ k: "deadline" })}><Icon name="pencil" size={12} /></button>}</>}
      </span>
    </>;
    actions = <>
      {user.key !== "iv" && <Button variant="secondary" icon="upload" disabled={lg} title={lg ? LEGACY_TIP : undefined} onClick={() => setDlg({ k: "upload", dest: isPool ? "pool" : job.id })}>Upload CVs</Button>}
      {!isPool && user.key !== "iv" && <span style={{ position: "relative" }}>
        <Button variant="secondary" icon="settings" iconRight="chevron-down" aria-haspopup="menu" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((o) => !o)}>Settings</Button>
        <Pop open={settingsOpen} onClose={() => setSettingsOpen(false)} top={40} width={220}>
          <Menu items={[
            ...(job.status === "Draft" && user.canCreate ? [{ label: "Open position", icon: "circle-check", disabled: !!job.processing || lg, onClick: f(() => { if (!job.deadline) { setDlg({ k: "open", job }); return; } void transition(job, "open").then((ok) => ok && say(`${job.title} is open`, "You can now upload CVs.", undefined, "briefcase")); }) }] : []),
            ...(user.key === "hr" && (job.status === "Open" || job.status === "On hold") ? [{ label: "Close position", icon: "archive", danger: true, disabled: lg, onClick: f(() => setDlg({ k: "close", job })) }] : []),
            ...(user.key === "hr" && (job.status === "Closed" || job.status === "On hold") ? [{ label: "Reopen position", icon: "rotate-ccw", disabled: lg, onClick: f(() => setDlg({ k: "reason", job, to: "reopen" })) }] : []),
            ...(canHc ? [{ label: "Edit headcount", icon: "users", onClick: f(() => setDlg({ k: "hc" })) }] : []),
            "-" as const,
            { label: "Description & criteria", icon: "file-text", onClick: f(() => setDlg({ k: "jd" })) },
            { label: "View JD file", icon: "file-text", onClick: f(() => setDlg({ k: "jdfile" })) },
            { label: "Pipeline", icon: "route", onClick: f(() => setDlg({ k: "pipeline" })) },
            ...(user.key !== "rc" ? [{ label: "Access", icon: "shield", onClick: f(() => setDlg({ k: "access" })) }] : []),
          ]} />
        </Pop>
      </span>}
    </>;

    jdTab = <DescriptionTab job={job} user={user} onDetail={(k, v) => {
          const uuid = uuidMap.current.get(job.id);
          if (!uuid) return;
          updatePosition(uuid, { [k]: v || null }).then(() => updJob(job.id, { details: { ...(job.details as NonNullable<Job["details"]>), [k]: v || null } })).catch((e) => fail("Could not save field", e));
        }} onSaveCriteria={async (crit) => {
          const uuid = uuidMap.current.get(job.id);
          if (!uuid) return 0;
          const toDb = { "Must have": "must_have", "Nice to have": "nice_to_have", "Bonus": "bonus" } as const;
          try {
            const r = await saveCriteria(uuid, crit.map((c) => ({ requirement: c.req, importance: toDb[c.imp as keyof typeof toDb] ?? "nice_to_have", origin: c.origin === "HR" ? "manual" : "jd" })));
            updJob(job.id, { criteria: r.requirements.map((x) => ({ id: x.id, req: x.requirement, imp: IMP_LABEL[x.importance], origin: (x.origin === "manual" ? "HR" : "AI") as "AI" | "HR" })) });
            say("Criteria saved", r.staleApplications > 0 ? `${r.staleApplications} scored candidates need a rescore.` : "Scoring criteria updated.");
            return r.staleApplications;
          } catch (e) { fail("Could not save criteria", e); throw e; }
        }} onRescore={async () => {
          const uuid = uuidMap.current.get(job.id);
          if (!uuid) return;
          try { const n = await rescorePosition(uuid); say("Rescoring started", `${n} candidates queued.`); } catch (e) { fail("Could not start rescoring", e); throw e; }
        }} />;
    const tabCands = isPool ? cands.slice(0, 6).map((c) => ({ ...c, stage: "cv", sub: "New" })) : user.key === "iv" ? myCands : cands;
    body = (
      <div style={{ padding: embedded ? "0 0 32px" : "0 24px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
        <EntityTabs tabs={tabs} value={tab} onChange={(v) => { setPreset(null); nav({ ...route, tab: v, upView: undefined }); }} />
        {lg && (
          <Banner tone="warning" icon="archive" title="Cấu trúc cũ"
            action={user.key === "hr" && jobUuid ? <Button size="sm" icon="arrow-right-left" onClick={() => setDlg({ k: "migrate" })}>Chuyển sang cấu trúc mới</Button> : undefined}>
            {LEGACY_TIP} Bạn vẫn xem được dữ liệu; chỉ HR mới chuyển đổi được.
          </Banner>
        )}
        {isPool && tab === "candidates" && (
          <Banner tone="info" icon="archive" title="Talent pool">Candidates kept after a position closed or uploaded without a position. Add them to an open position with “Move to position…”; their history stays attached.</Banner>
        )}
        {tab === "candidates" && <CandidatesTab key={preset?.k} user={user} cands={tabCands} h={h} view={view} setView={setView} isPool={isPool} open={openCand} preset={preset || undefined} stages={isPool ? STAGES : stages} />}
        {tab === "mine" && <MyInterviewsTab items={myHere} onOpenCandidate={(caId) => {
          const id = candIdMap.current.get(caId);
          if (id != null) openCand(id, [id], "My interviews"); else say("Candidate not loaded yet", "Open the Candidates tab and try again.", undefined, "info");
        }} onNoShow={(m) => {
          markNoShow(m.campaignAppliedId, m.id)
            .then(() => { say("Marked as no-show", "HR and the organizer were notified.", undefined, "user-x"); reloadMine(); })
            .catch((e: unknown) => say("Could not mark the no-show", e instanceof Error ? e.message : undefined, undefined, "info"));
        }} />}
        {tab === "overview" && <div style={{ padding: "64px 0", textAlign: "center", color: "var(--fg-muted, #6b7280)", fontSize: 14 }}>This tab in development process, please wait</div>}
        {tab === "uploads" && <UploadsTab key={job.id} bs={bs} histErr={histErr} h={h} att={upAtt} resolve={resolveUp} admin={user.key === "hr"}
          view={upView} setView={(v) => { setUpViewS(v); nav({ ...route, upView: v }); }} isPool={isPool}
          onOpenCand={(f) => { if (f.candId != null) setDrawer(f.candId); else say(f.file, f.did); }} />}
        {tab === "jd" && jdTab}
      </div>
    );
  }
  void upViewS;

  const rejectIds = dlg?.k === "reject" ? dlg.ids : [];
  return (
    <Shell embedded={embedded} active="jobs" user={user} crumbs={crumbs} title={title} subtitle={subtitle} onBack={onBack} trail={trail} meta={meta} actions={actions} onHome={home}>
      {body}

      <CandidateDrawer key={dc?.id ?? "none"} stages={stages} c={dc} user={user} h={h} nav={navCtx && !navCtx.done ? { ids: navCtx.ids, label: navCtx.label } : null} onOpen={setDrawer} onClose={() => { setDrawer(null); setNavCtx(null); }}
        onRescore={(c) => { upd(c.id, { st: "scoring" }); say("Rescoring started", `${c.name} is being scored again. The match will update shortly.`, undefined, "rotate-ccw"); }}
        onShare={() => dc && setShare(dc.name)}
        onSubmitNotes={(c, v) => {
          upd(c.id, { ivDone: true, ivNote: v, noNote: false });
          reloadMine();
          say("Interview notes submitted", "The AI match and other interviewers' notes are now visible to you.", undefined, "circle-check");
        }} />
      {share && <ShareEvaluationDialog name={share} onClose={() => setShare(null)} />}

      {dlg?.k === "open" && job && <DeadlineDialog job={dlg.job} title="Set deadline to open" confirmLabel="Confirm & open position" onClose={() => setDlg(null)} onSave={async (iso) => {
        const target = dlg.job;
        const uuid = uuidMap.current.get(target.id);
        if (!uuid) return;
        try {
          // A fresh draft has no start date either, and opening requires both.
          await updatePosition(uuid, { deadline: iso, startDate: new Date().toISOString().slice(0, 10) });
          await transitionPosition(uuid, "open");
          setDlg(null); await reload();
          say(`${target.title} is open`, "You can now upload CVs.", undefined, "briefcase");
        } catch (e) { fail("Could not open the position", e); }
      }} />}
      {dlg?.k === "deadline" && job && <DeadlineDialog job={job} onClose={() => setDlg(null)} onSave={(iso) => {
        const uuid = uuidMap.current.get(job.id);
        if (!uuid) return;
        updatePosition(uuid, { deadline: iso }).then(async () => {
          setDlg(null); await reload();
          say("Deadline updated", `${job.title} now closes on ${iso.split("-").reverse().join("/")}.`, undefined, "calendar");
        }).catch((e) => fail("Could not update deadline", e));
      }} />}
      {dlg?.k === "hc" && job && <HeadcountDialog job={job} onClose={() => setDlg(null)} onSave={(n) => {
        const uuid = uuidMap.current.get(job.id);
        if (!uuid) return;
        updatePosition(uuid, { headcount: n }).then(() => {
          updJob(job.id, { headcount: n }); setDlg(null);
          say("Headcount updated", `${job.title} now needs ${n} hire${n === 1 ? "" : "s"} · ${n - job.hired} open.`, undefined, "users");
        }).catch((e) => fail("Could not update headcount", e));
      }} />}
      {dlg?.k === "create" && <CreateJobDialog onClose={() => { setDlg(null); setCreateErr(null); }} onSubmit={(v) => void createJob(v)} chapters={chInfo?.chapters ?? []} pipelines={pipelineChoices} defaultChapterId={chInfo && !chInfo.isHr ? chInfo.headedChapterIds[0] : undefined} lockChapter={!!chInfo && !chInfo.isHr && chInfo.headedChapterIds.length > 0} busy={creating} error={createErr} />}
      {dlg?.k === "upload" && <UploadDialog dest={dlg.dest} lockDest={!!job} jobs={visible} resolveTarget={(to) => (to === "pool" ? "pool" : uuidMap.current.get(Number(to)))} onClose={() => setDlg(null)} onStart={(b) => { setDlg(null); setBatch({ ...b, key: Date.now() }); }} />}
      {batch && <UploadTray key={batch.key} batch={batch} onClose={() => setBatch(null)}
        onOpen={() => go(batch.to === "pool" ? "pool" : Number(batch.to), "candidates")}
        onDone={(r) => {
          if (r instanceof Error) { fail("Upload failed", r); return; }
          void reload(); void loadHist();
          if (r.failed) say(`${r.ok} of ${r.ok + r.failed} CVs queued`, `${r.failed} file(s) failed. See the upload panel.`, undefined, "triangle-alert");
          else say("CVs uploaded", `${r.ok} file(s) are being read and scored. They'll appear in Candidates shortly.`, { label: "View candidates", fn: () => go(batch.to === "pool" ? "pool" : Number(batch.to), "candidates") }, "bell");
        }} />}
      {dlg?.k === "apps" && <ApplicationsDialog target={dlg.target} fileId={dlg.fileId} file={dlg.file} onClose={() => setDlg(null)} />}
      {dlg?.k === "manual" && <ManualEntryFromUploadModal jobTitle={job?.title}
        row={{ id: dlg.f.id!, job_id: dlg.target === "pool" ? null : dlg.target, candidate_id: null, batch_id: "", file_name: dlg.f.file, storage_key: dlg.f.storageKey ?? "", file_hash: "", mime_type: dlg.f.mimeType ?? null, status: "failed", error_code: dlg.f.errorCode ?? null, error_message: null, error_stage: null, file_source: dlg.f.fileSource ?? null, recruiter: dlg.f.recruiter ?? null, uploaded_by: null, is_existed: false, created_at: new Date(), updated_at: new Date() } as FileUploadRow}
        onClose={() => setDlg(null)} onSaved={() => { setDlg(null); void reload(); void loadHist(); }} />}
      {dlg?.k === "hire" && job && <HireDialog c={dlg.c} job={job} jobUuid={uuidMap.current.get(job.id)} onClose={() => setDlg(null)} onOk={({ startDate, mentorId }) => {
        const c = dlg.c, s = stageOf(dlg.to, stages), old = { stage: c.stage, sub: c.sub, days: c.days };
        upd(c.id, { stage: dlg.to, sub: s.def, days: 0 }); setDlg(null);
        void persistStage(c, dlg.to, s.def, old, `${c.name} hired`, `Starts ${startDate.split("-").reverse().join("/")}.`, "badge-check", false, undefined, startDate, mentorId);
      }} />}
      {dlg?.k === "bulkmove" && <BulkMoveDialog cands={cands.filter((c) => dlg.ids.includes(c.id))} stages={stages} onClose={() => setDlg(null)} onOk={(p) => {
        const olds = cands.filter((c) => p.ids.includes(c.id)).map((c) => ({ id: c.id, stage: c.stage, sub: c.sub, days: c.days }));
        const to = p.kind === "stage" ? stageOf(p.value, stages) : null;
        const moving = cands.filter((c) => p.ids.includes(c.id));
        dlg.clear?.(); setDlg(null);
        if (to) p.ids.forEach((id) => upd(id, { stage: to.id, sub: to.def, days: 0 }));
        else p.ids.forEach((id) => upd(id, { sub: p.value }));
        void Promise.allSettled(moving.map((c) => (to ? saveStage(c, to.id, to.def) : saveStage(c, c.stage, p.value)))).then((rs) => {
          const failed = olds.filter((_, i) => rs[i].status === "rejected");
          failed.forEach(({ id, ...o }) => upd(id, o));
          if (failed.length) fail(`Could not move ${failed.length} candidate${failed.length > 1 ? "s" : ""}`, rs.find((r): r is PromiseRejectedResult => r.status === "rejected")?.reason);
          const okC = moving.filter((_, i) => rs[i].status === "fulfilled"), ok = okC.length;
          if (!ok) return;
          const undo = () => okC.forEach((c) => {
            const o = olds.find((x) => x.id === c.id)!;
            revertStage({ ...c, stage: to ? to.id : c.stage, sub: to ? to.def : p.value }, { stage: o.stage, sub: o.sub, days: o.days });
          });
          say(to ? `${ok} moved to ${to.label}` : `${ok} set to ${p.value}`, to ? `Each starts at step “${to.def}”.` : undefined, { label: "Undo", fn: undo }, "arrow-right");
        });
      }} />}
      {dlg?.k === "remove" && <RemoveDialog names={cands.filter((c) => dlg.ids.includes(c.id)).map((c) => c.name)}
        onClose={() => setDlg(null)} onOk={({ notifyInterviewers }) => {
          const gone = cands.filter((c) => dlg.ids.includes(c.id));
          setCands((cs) => cs.filter((c) => !dlg.ids.includes(c.id)));
          dlg.clear?.(); setDlg(null);
          void Promise.allSettled(gone.map((c) => (c.caId ? removeCandidate(c.caId, notifyInterviewers) : Promise.resolve()))).then((rs) => {
            const failed = gone.filter((_, i) => rs[i].status === "rejected");
            if (failed.length) {
              setCands((cs) => [...cs, ...failed]);
              const first = rs.find((r): r is PromiseRejectedResult => r.status === "rejected");
              fail(`Could not remove ${failed.length} candidate${failed.length > 1 ? "s" : ""}`, first?.reason);
            }
            const ok = gone.length - failed.length;
            if (ok) say(`${ok} removed from position`, "Upcoming interviews were canceled.", undefined, "x");
          });
        }} />}
      {dlg?.k === "movesess" && <MoveWithSessionsDialog name={dlg.c.name} to={stageOf(dlg.to, stages).label} sessions={dlg.sessions}
        onClose={() => setDlg(null)} onOk={(o) => { moveTo(dlg.c, dlg.to, o); setDlg(null); }} />}
      {dlg?.k === "notpass" && <NotPassReasonDialog name={dlg.c.name} sub={dlg.sub} onClose={() => setDlg(null)} onOk={(reason) => {
        const { c, sub } = dlg;
        const s = stageOf(c.stage, stages);
        const old = { sub: c.sub };
        setDlg(null);
        upd(c.id, { sub });
        void persistStage(c, c.stage, sub, old, `${c.name} · ${s.label} set to ${sub}`, undefined, "circle-x", false, undefined, undefined, undefined, reason);
      }} />}
      {dlg?.k === "reject" && <RejectDialog names={cands.filter((c) => rejectIds.includes(c.id)).map((c) => c.name)}
        unreviewed={cands.filter((c) => rejectIds.includes(c.id) && !c.notes).length}
        onClose={() => setDlg(null)} onOk={({ reason, notifyInterviewers }) => {
          const rejected = cands.filter((c) => rejectIds.includes(c.id));
          setCands((cs) => cs.filter((c) => !rejectIds.includes(c.id)));
          void Promise.allSettled(rejected.map((c) => {
            const st = stageOf(c.stage, stages);
            const subId = st.fail ? st.subIds?.[st.fail] : undefined;
            return c.caId && subId ? updateCandidateStage(c.caId, st.id, subId, reason, notifyInterviewers) : Promise.resolve();
          })).then((rs) => {
            const failed = rejected.filter((_, i) => rs[i].status === "rejected");
            const done = rejected.filter((_, i) => rs[i].status === "fulfilled");
            if (failed.length) {
              setCands((cs) => [...cs, ...failed]);
              const first = rs.find((r): r is PromiseRejectedResult => r.status === "rejected");
              fail(`Could not reject ${failed.length} candidate${failed.length > 1 ? "s" : ""}`, first?.reason);
            }
            if (!done.length) return;
            // Undo reverts server-side within 10 minutes; canceled interviews stay canceled.
            say(`${done.length} rejected`, "Candidates rejected.", { label: "Undo", fn: () => {
              void Promise.allSettled(done.map((c) => (c.caId ? undoReject(c.caId) : Promise.resolve()))).then((us) => {
                const back = done.filter((_, i) => us[i].status === "fulfilled");
                if (back.length) {
                  const ids = new Set(back.map((c) => c.id));
                  setCands((cs) => [...cs.filter((c) => !ids.has(c.id)), ...back]);
                }
                const firstErr = us.find((r): r is PromiseRejectedResult => r.status === "rejected");
                if (firstErr) fail(`Could not undo ${done.length - back.length} reject${done.length - back.length > 1 ? "s" : ""}`, firstErr.reason);
                else say(`${back.length} restored`, "Reject undone. Canceled interviews were not restored.", undefined, "rotate-ccw");
              });
            } }, "x");
          });
          dlg.clear?.();
          if (navCtx?.review && drawer != null) {
            const rest = navCtx.ids.filter((id) => !rejectIds.includes(id) && id !== drawer);
            if (rest.length) setDrawer(rest[0]); else { setNavCtx({ ...navCtx, done: true }); setDrawer(null); }
          } else setDrawer(null);
          setDlg(null);
        }} />}
      {dlg?.k === "jd" && job && !isPool && <Dialog title="Description & criteria" description={job.title} width={960} onClose={() => setDlg(null)} footer={<Button variant="secondary" onClick={() => setDlg(null)}>Close</Button>}>{jdTab}</Dialog>}
      {dlg?.k === "jdfile" && job && !isPool && <Dialog title="JD file" description={job.title} width={960} onClose={() => setDlg(null)} footer={<Button variant="secondary" onClick={() => setDlg(null)}>Close</Button>}>{uuidMap.current.get(job.id) ? <iframe src={`/api/admin/job-descriptions/${uuidMap.current.get(job.id)}/jd-download`} title="JD file preview" style={{ width: "100%", height: "70vh", border: 0 }} /> : null}</Dialog>}
      {dlg?.k === "pipeline" && job && !isPool && <Dialog title="Pipeline" description={job.title} width={780} onClose={() => setDlg(null)} footer={<Button variant="secondary" onClick={() => setDlg(null)}>Close</Button>}><PipelineTab stages={stages} /></Dialog>}
      {dlg?.k === "migrate" && job && !isPool && uuidMap.current.get(job.id) && <MigrateWizard jobUuid={uuidMap.current.get(job.id)!} jobTitle={job.title} onClose={() => setDlg(null)} onDone={() => { setDlg(null); void reload(); say("Đã chuyển sang cấu trúc mới", job.title, undefined, "circle-check"); }} />}
      {dlg?.k === "access" && job && !isPool && <Dialog title="Access" description={job.title} width={720} onClose={() => setDlg(null)} footer={<Button variant="secondary" onClick={() => setDlg(null)}>Close</Button>}><AccessTab user={user} uuid={uuidMap.current.get(job.id)} /></Dialog>}
      {dlg?.k === "close" && <CloseJobDialog job={dlg.job} blocking={dlg.blocking} busy={dlg.busy} onClose={() => setDlg(null)} onOk={({ notifyInterviewers }) => {
        const j = dlg.job;
        setDlg({ ...dlg, busy: true });
        void transition(j, "close", { notifyInterviewers }).then((ok) => {
          if (!ok) { setDlg((d) => (d?.k === "close" ? { ...d, busy: false } : d)); return; }
          setDlg(null); home();
          say(`${j.title} closed`, "Candidate stages were recorded with the position.", undefined, "archive");
        });
      }} />}
      {dlg?.k === "reason" && <StatusReasonDialog job={dlg.job} to={dlg.to} busy={dlg.busy} onClose={() => setDlg(null)} onOk={({ reason, notifyInterviewers }) => {
        const { job: j, to } = dlg;
        setDlg({ ...dlg, busy: true });
        void transition(j, to, { reason, notifyInterviewers }).then((ok) => {
          if (!ok) { setDlg((d) => (d?.k === "reason" ? { ...d, busy: false } : d)); return; }
          setDlg(null);
          if (to === "hold") say(`${j.title} is on hold`, undefined, undefined, "pause");
          else say(`${j.title} reopened`, undefined, undefined, "rotate-ccw");
        });
      }} />}
      <Toast t={toast} onClose={() => setToast(null)} />
    </Shell>
  );
}
