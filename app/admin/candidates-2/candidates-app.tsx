 
"use client";

import * as React from "react";
import { lsGet, lsSet } from "../position-management-2/ext";
import { Shell, Toast, type ToastMsg } from "../position-management-2/shell";
import type { Role } from "../position-management-2/data";
import {
  JOBS, PERSONAS, RETAIN, RL, REHIRE, TODAY, addM,
  type CandApp, type Job, type Person,
} from "./data";
import { BulkTagDialog, ReminderDialog, logE, type Act } from "./cand-mvp";
import { AddToPositionDialog, CompareCVDialog, ContactDialog, DeleteDialog, MergeDialog, UploadCVDialog } from "./cand-dialogs";
import { CandidatesList } from "./cand-list";
import { endApplication, setRehire, exportProfile, fetchCandidate, rescoreApplication, setExperience, updateContact, uploadCv } from "./api";
import { CandidateProfile, ProfileMoreMenu } from "./cand-profile";

type Route = { page: "list" } | { page: "profile"; id: number; uuid: string; tab: string };
type Dlg = { k: string; ids?: number[]; done?: () => void; [key: string]: any } | null;

export function CandidatesApp({ embedded = false }: { embedded?: boolean }) {
  const pk = "hr";
  const [route, setRoute] = React.useState<Route>({ page: "list" });
  const [people, setPeople] = React.useState<Person[]>([]);
  const uuidRef = React.useRef<Map<number, string>>(new Map());
  const [dlg, setDlg] = React.useState<Dlg>(null);
  const [toast, setToast] = React.useState<ToastMsg>(null);

  React.useEffect(() => {
    const r = lsGet<Route>("cd-route", { page: "list" });
    if (r && (r.page === "list" || r.page === "profile")) setRoute(r);
  }, []);
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.action ? 6000 : 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const user = PERSONAS.find((x) => x.key === pk) || PERSONAS[0];
  const u = user as any;

  const nav = (r: Route) => { setRoute(r); lsSet("cd-route", r); };
  const list = () => nav({ page: "list" });
  const openP = (id: number, tab = "overview") => {
    const uuid = uuidRef.current.get(id) ?? (route.page === "profile" && route.id === id ? route.uuid : undefined);
    if (!uuid) return;
    nav({ page: "profile", id, uuid, tab });
  };
  const say = (title: string, body?: string, action?: { label: string; fn: () => void }, icon?: string) => setToast({ title, body, action, icon });
  const upd = (id: number, f: (x: Person) => Partial<Person>) => setPeople((ps) => ps.map((x) => (x.id === id ? { ...x, ...f(x) } : x)));

  const p = route.page === "profile" ? people.find((x) => x.id === route.id) || null : null;
  const canSee = !!p;
  const [loadErr, setLoadErr] = React.useState<string | null>(null);
  const profileUuid = route.page === "profile" ? route.uuid : null;
  const profileId = route.page === "profile" ? route.id : null;
  // The person may not be on the loaded list page, so the profile always fetches by uuid.
  React.useEffect(() => {
    if (!profileUuid || profileId == null) return;
    const ctrl = new AbortController();
    setLoadErr(null);
    fetchCandidate(profileUuid, profileId, ctrl.signal)
      .then((person) => setPeople((ps) => (ps.some((x) => x.id === profileId) ? ps.map((x) => (x.id === profileId ? person : x)) : [...ps, person])))
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === "AbortError") return;
        setLoadErr(e instanceof Error ? e.message : "Could not load candidate.");
      });
    return () => ctrl.abort();
  }, [profileUuid, profileId]);

  const jobs: Job[] = JOBS.filter((j) => (u.allJobs ? true : u.chapter ? j.chapter === u.chapter : (u.shared || []).includes(j.id)));

  const addTo = (ids: number[], job: Job, cv: string) => {
    const stamp = Date.now();
    setPeople((ps) => ps.map((x) => {
      if (!ids.includes(x.id)) return x;
      const app: CandApp = {
        id: "n" + stamp + "-" + x.id, job: job.id, title: job.title, chapter: job.chapter, jobStatus: job.status, date: TODAY,
        stage: "New", sub: "Waiting for screening", result: "open", scoring: true,
      };
      return { ...x, apps: [app, ...x.apps], updated: TODAY, log: logE(user, "briefcase", "Added to " + job.title, cv)(x) };
    }));
    setTimeout(() => {
      setPeople((ps) => ps.map((x) => ({
        ...x,
        apps: x.apps.map((a) => (a.id.startsWith("n" + stamp) && a.scoring ? { ...a, scoring: false, score: 62 + ((x.id * 7) % 30), band: "Good fit" } : a)),
      })));
    }, 2600);
  };

  const act: Act = (k, x) => {
    if (!p) return;
    switch (k) {
      case "tab": openP(p.id, x); break;
      case "open": openP(x); break;
      case "openApp": say("Opens in Positions", "Would navigate to “" + (x?.title || "this position") + "” in the full app."); break;
      case "say": say(x); break;
      case "export":
        if (!p.uuid) {
          say("Profile exported", "A PDF of " + p.name + "’s profile was prepared.");
          break;
        }
        exportProfile(p.uuid)
          .then(() => say("Profile exported", "A PDF of " + p.name + "’s profile was downloaded. Internal notes are not included."))
          .catch((e: unknown) => say("Could not export profile", e instanceof Error ? e.message : undefined));
        break;
      case "patch": {
        const before = p;
        upd(p.id, (c) => ({ ...x.f(c), updated: TODAY }));
        say(x.title, x.body, { label: "Undo", fn: () => setPeople((ps) => ps.map((c) => (c.id === before.id ? before : c))) }, x.icon);
        break;
      }
      case "rehire": {
        if (!p.uuid) break;
        const { v, r } = x as { v: "eligible" | "ask" | "no"; r: string };
        setRehire(p.uuid, p.id, { status: v === "no" ? "not_eligible" : v, reason: r })
          .then((np) => { setPeople((ps) => ps.map((c) => (c.id === np.id ? np : c))); say("Rehire eligibility saved", REHIRE[v].label, undefined, "user-check"); })
          .catch((e: unknown) => say("Could not save rehire eligibility", e instanceof Error ? e.message : undefined));
        break;
      }
      case "reason": {
        const { a, k: rk, n } = x as { a: CandApp; k: string; n: string };
        if (!p.uuid) {
          act("patch", { f: (c: Person) => ({ apps: c.apps.map((y) => (y.id === a.id ? { ...y, rk, reason: n } : y)) }), title: "Reason recorded", body: RL[rk] + " · " + a.title + " #" + a.job, icon: "check" });
          break;
        }
        endApplication(p.uuid, p.id, { applicationId: a.id, reason: rk, note: n })
          .then((np) => { setPeople((ps) => ps.map((c) => (c.id === np.id ? np : c))); say("Reason recorded", RL[rk] + " · " + a.title, undefined, "check"); })
          .catch((e: unknown) => say("Could not save reason", e instanceof Error ? e.message : undefined));
        break;
      }
      case "revert":
      case "usecv": {
        const years = k === "revert" ? p.edits?.exp?.ai : p.conflict?.cv;
        const appId = p.apps[0]?.id;
        if (years == null) break;
        if (!p.uuid || !appId) {
          say("Could not update experience", "This profile has no CV on record.");
          break;
        }
        const [icon, title, toast] = k === "revert"
          ? ["rotate-ccw", "Experience reverted to AI value", "Reverted to AI value"]
          : ["file-text", "Experience set from CV", "Updated from CV"];
        setExperience(p.uuid, p.id, { applicationId: appId, years, summary: title })
          .then((np) => {
            setPeople((ps) => ps.map((x) => (x.id === np.id ? { ...np, log: logE(user, icon, title)(x) } : x)));
            say(toast);
          })
          .catch((e: unknown) => say("Could not update experience", e instanceof Error ? e.message : undefined));
        break;
      }
      case "rescore": {
        const a = x as CandApp | undefined;
        if (!a || !p.uuid) break;
        rescoreApplication(p.uuid, a.id)
          .then(() => {
            upd(p.id, (c) => ({
              apps: c.apps.map((y) => (y.id === a.id ? { ...y, scoring: true, scoreErr: false } : y)),
              log: logE(user, "refresh-cw", `Re-scored ${a.title}`)(c),
            }));
            say("Re-scoring started", "The new match score will appear shortly.");
          })
          .catch((e: unknown) => say("Could not re-score", e instanceof Error ? e.message : undefined));
        break;
      }
      case "keep":
        upd(p.id, (c) => ({ conflict: null, log: logE(user, "check", "Kept manual experience value")(c) }));
        say("Kept your value", "The CV value was dismissed.");
        break;
      case "notdup":
        upd(p.id, (c) => ({ dupOf: undefined, log: logE(user, "users", "Marked as not a duplicate")(c) }));
        say("Marked as different people");
        break;
      case "merge": case "contact": case "delete": case "upload": case "compare":
        setDlg({ k, ids: [p.id] });
        break;
    }
  };

  const close = () => setDlg(null);
  const dp = dlg?.ids && dlg.ids.length ? people.find((x) => x.id === dlg.ids![0]) : null;
  const dupOther = p && (p as any).dupOf ? people.find((x) => x.id === (p as any).dupOf) : null;

  const onBulk = (k: string, ids: number[], done: () => void) => {
    if (k === "consent") {
      ids.forEach((id) => upd(id, (c) => ({ consent: { date: TODAY, via: "Renewed by email, recorded by " + user.name }, log: logE(user, "file-check", "Consent renewed", "kept until " + addM(TODAY, RETAIN))(c) })));
      say("Consent recorded", ids.length + " record" + (ids.length === 1 ? "" : "s") + " kept until " + addM(TODAY, RETAIN) + ".", undefined, "file-check");
      done();
      return;
    }
    setDlg({ k: k === "tag" ? "btag" : "brem", ids, done });
  };

  const header = route.page === "profile" && p
    ? { title: p.name, trail: [{ label: "Candidates" }, { label: p.name }], subtitle: p.role + " · " + p.exp + " yrs", crumbs: ["Work"] }
    : { title: "Candidates", trail: [{ label: "Candidates" }], subtitle: "Every person who has applied, across all positions.", crumbs: ["Work"] };

  const shellUser = { key: user.key, name: user.name, role: user.role, salary: user.salary, canCreate: user.canCreate, canDecide: user.canDecide } as unknown as Role;

  return (
    <>
      <Shell
        embedded={embedded} onHome={() => {}} user={shellUser} active="cands" crumbs={header.crumbs} title={header.title} trail={header.trail}
        subtitle={header.subtitle}
        onBack={route.page === "profile" ? list : undefined}
        actions={route.page === "profile" && p ? <ProfileMoreMenu user={user} act={act} /> : undefined}
      >
        <div className="cd-root">
          {route.page === "profile" && p && canSee ? (
            <CandidateProfile key={p.id} p={p} user={user} tab={route.tab} setTab={(t) => openP(p.id, t)} act={act} people={people} />
          ) : route.page === "profile" ? (
            <div style={{ padding: 32 }}>
              {loadErr ? (<>{loadErr} <button className="btn" onClick={list}>Back to list</button></>) : "Loading candidate…"}
            </div>
          ) : (
            <CandidatesList
              user={user} open={(id) => openP(id)}
              onLoaded={(r) => { uuidRef.current = r.uuidById; setPeople(r.people); }}
              onAdd={(ids, done) => setDlg({ k: "add", ids, done })}
              onExport={(n) => say("List exported", n + " candidate" + (n === 1 ? "" : "s") + " exported to CSV.", undefined, "download")}
              onBulk={onBulk}
            />
          )}
        </div>
      </Shell>

      {dlg?.k === "add" && (
        <AddToPositionDialog
          people={people.filter((x) => dlg.ids!.includes(x.id))} jobs={jobs} onClose={close}
          onOk={(job, count, cv) => {
            addTo(dlg.ids!, job, cv);
            dlg.done?.(); close();
            say("Added to " + job.title, count + " candidate" + (count === 1 ? "" : "s") + " now in New. Scoring started.", undefined, "briefcase");
          }}
        />
      )}
      {dlg?.k === "merge" && p && dupOther && (
        <MergeDialog
          a={p} b={dupOther} onClose={close}
          onOk={() => {
            setPeople((ps) => ps.filter((x) => x.id !== dupOther.id).map((x) => (x.id === p.id ? { ...x, dupOf: undefined, apps: [...x.apps, ...dupOther.apps], log: logE(user, "git-merge", "Merged with " + dupOther.name)(x) } : x)));
            close(); say("Records merged", dupOther.name + " was merged into " + p.name + ".", undefined, "git-merge");
          }}
        />
      )}
      {dlg?.k === "delete" && p && (
        <DeleteDialog
          p={p} onClose={close}
          onOk={(mode) => {
            close();
            if (mode === "del") setPeople((ps) => ps.filter((x) => x.id !== p.id));
            else upd(p.id, (c) => ({ name: "Anonymized candidate", email: "—", phone: "—", log: logE(user, "shield", "Anonymized")(c) }));
            list();
            say(mode === "del" ? "Record deleted" : "Record anonymized");
          }}
        />
      )}
      {dlg?.k === "contact" && p && (
        <ContactDialog
          p={p} onClose={close}
          onOk={(v) => {
            updateContact(p.uuid ?? "", p.id, v)
              .then((np) => { setPeople((ps) => ps.map((x) => (x.id === p.id ? { ...np, log: logE(user, "phone", "Contact details updated")(x) } : x))); close(); say("Contact details updated"); })
              .catch((e: unknown) => say("Could not update contact", e instanceof Error ? e.message : undefined));
          }}
        />
      )}
      {dlg?.k === "upload" && p && (
        <UploadCVDialog
          p={p} onClose={close}
          onOk={(file, target) =>
            uploadCv(p.uuid ?? "", p.id, { file, target })
              .then((np) => { setPeople((ps) => ps.map((x) => (x.id === p.id ? { ...np, log: logE(user, "upload", "CV uploaded", file.name)(x) } : x))); close(); say("CV uploaded", file.name); })
              .catch((e: unknown) => say("Could not upload CV", e instanceof Error ? e.message : undefined))}
        />
      )}
      {dlg?.k === "compare" && p && <CompareCVDialog p={p} onClose={close} />}
      {dlg?.k === "btag" && (
        <BulkTagDialog
          n={dlg.ids!.length} tags={Array.from(new Set(people.flatMap((x) => x.tags || []))).sort()} onClose={close}
          onOk={(t) => {
            dlg.ids!.forEach((id) => upd(id, (c) => ({ tags: (c.tags || []).includes(t) ? c.tags : [...(c.tags || []), t] })));
            dlg.done?.(); close(); say("Tag added", "“" + t + "” added to " + dlg.ids!.length + " candidates.", undefined, "tag");
          }}
        />
      )}
      {dlg?.k === "brem" && dp && (
        <ReminderDialog
          p={{ name: dlg.ids!.length > 1 ? dlg.ids!.length + " candidates" : dp.name, remind: dlg.ids!.length > 1 ? undefined : dp.remind }} onClose={close}
          onOk={(d, n) => {
            dlg.ids!.forEach((id) => upd(id, (c) => ({ remind: { date: d, note: n, owner: user.name }, log: logE(user, "bell-plus", "Reminder set", d)(c) })));
            dlg.done?.(); close(); say("Reminder set", "Re-contact on " + d + ".", undefined, "bell-plus");
          }}
        />
      )}
      <Toast t={toast} onClose={() => setToast(null)} />
    </>
  );
}
