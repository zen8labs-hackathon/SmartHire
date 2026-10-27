"use client";
// "What happens next" panel + list-cell, ported from the design's app-nextstep.jsx.
import * as React from "react";
import { STAGES, type Candidate, type Role, type RoleKey, type Stage } from "./data";
import { Icon } from "./ext";

export type StepState = "done" | "now" | "todo" | "fail";
export type Step = { label: string; state: StepState; owner?: Owner; note?: string };
type Owner = { keys: string[]; name: string; role?: string };
export type ActType =
  | "move" | "consider" | "fail" | "rescore" | "sched" | "interview" | "resched"
  | "remind" | "nextRound" | "noShow" | "sub" | "patch" | "prob";
export type Act = {
  t: ActType; label: string; icon: string; primary?: boolean; decision?: boolean;
  to?: string; sub?: string; patch?: Record<string, unknown>; msg?: string; who?: string; act?: string;
};
export type NextStep = {
  steps: Step[]; owner: Owner | null; acts: Act[]; title: string; ended: boolean; mine: boolean;
  why: string | null; hold: { what: string; who: string } | null;
};
export type NextStepOpts = {
  /** Must-have criteria counts (met / total) for the CV step note. */
  mustHaves?: { met: number; total: number } | null;
  /** Viewer holds an interviewer seat on the current session. */
  viewerIsIv?: boolean;
  /** Current interview schedule, if any. */
  sched?: { d: string; past?: boolean; noShow?: boolean; done?: boolean } | null;
  mentor?: string | null;
  probation?: { status: "awaiting" | "active" | "decision" | "passed" | "ended"; planned?: string; daysLeft?: number } | null;
  accepted?: boolean;
  ivName?: string;
};

type Kind = "cv" | "iv" | "offer" | "prob" | "hired" | "other";
export function stageKind(s: Stage, idx: number): Kind {
  if (s.schedule) return "iv";
  if (s.probation) return "prob";
  if (s.id === "cv" || idx === 0) return "cv";
  if (s.id === "offer" || /offer/i.test(s.label)) return "offer";
  if (s.id === "hired" || /official|hired/i.test(s.label)) return "hired";
  return "other";
}

const P = {
  ch: { keys: ["ch", "hr", "iv"], name: "Chapter Head" } as Owner,
  hr: { keys: ["hr"], name: "HR" } as Owner,
  sys: { keys: [], name: "System", role: "AI scoring" } as Owner,
  cand: { keys: [], name: "Candidate", role: "recorded by HR" } as Owner,
  ops: (c: Candidate): Owner => ({ keys: ["hr", "ch", "rc"], name: c.owner, role: "Recruiter / HR" }),
  // BR-INT-01: only HR and Recruiters schedule interviews.
  sch: (c: Candidate): Owner => ({ keys: ["hr", "rc"], name: c.owner, role: "Recruiter / HR" }),
  ivs: (who?: string): Owner => ({ keys: ["iv"], name: who || "Interviewers" }),
};
const st = (label: string, state: StepState, owner?: Owner, note?: string): Step => ({ label, state, owner, note });

export function nextStep(c: Candidate, user: Role, stages: Stage[] = STAGES, o: NextStepOpts = {}): NextStep {
  const k: RoleKey = user.key;
  const idx = Math.max(0, stages.findIndex((s) => s.id === c.stage));
  const s = stages[idx] ?? stages[0];
  const next = stages[idx + 1];
  const kind = stageKind(s, idx);
  const dec = k === "hr" || k === "ch";
  // Anyone assigned to the position (interviewer or recruiter), HR and Admin may move a candidate on.
  // The session only resolves to hr/ch/rc, so "rc" covers position-assigned users; the API re-checks the grant.
  const adv = dec || k === "iv" || k === "rc";
  const op = adv;
  const rc = k === "rc";
  const failed = c.sub === s.fail && !!s.fail;
  const passed = c.sub === s.pass;
  const nextLabel = next?.label ?? "next stage";

  const moveTo = (to: string, label: string): Act | null =>
    op ? { t: "move", to, label: "Move to " + label, icon: "arrow-right", primary: true } : null;
  const compact = (a: (Act | null | false)[]) => a.filter(Boolean) as Act[];
  const prev = idx > 0 ? stages[idx - 1] : undefined;
  // A closed (failed) candidate can be reopened at the stage's default sub-stage.
  const reopen = (who = dec): Act | null => (who && s.def ? { t: "sub", sub: s.def, label: "Reopen", icon: "rotate-ccw" } : null);
  // Reject is always reachable for decision makers while a candidate is still open.
  const reject = (label = "Reject"): Act | null => (dec && s.fail ? { t: "fail", sub: s.fail, label, icon: "circle-x" } : null);
  // Replaces the old drawer "Move to" menu's move-back: only before any progress in this stage.
  const back = (): Act | null => (dec && prev && c.sub === s.def ? { t: "move", to: prev.id, label: "Back to " + prev.label, icon: "undo-2" } : null);

  let steps: Step[] = [], owner: Owner | null = null, acts: Act[] = [], title = "", ended = false;


  if (kind === "cv") {
    const mh = o.mustHaves;
    const scored = c.st === "done", err = c.st === "error";
    steps = [
      st(err ? "AI scoring failed" : scored ? "CV scored" : "AI scoring", err ? "fail" : scored ? "done" : "now", P.sys,
        err ? "Rescore or review manually" : scored ? (c.band === "review" ? "No band · manual review" : undefined) : "In progress"),
      st("Must-haves checked", scored ? "done" : "todo", P.sys, mh ? `${mh.met} of ${mh.total} met` : undefined),
      st(failed ? "Not passed" : passed ? "Passed" : "Pass, Consider or Not pass", failed ? "fail" : passed ? "done" : scored || err ? "now" : "todo", P.ops(c)),
      st("Move to " + nextLabel, "todo", P.ops(c)),
    ];
    if (failed) { ended = true; title = "Did not pass " + s.label; acts = compact([reopen()]); }
    else if (passed) {
      owner = P.ops(c); title = "Ready to move to " + nextLabel;
      acts = compact([next && moveTo(next.id, nextLabel), op && s.def ? { t: "sub", sub: s.def, label: "Undo pass", icon: "undo-2" } : null]);
    } else {
      owner = P.ops(c);
      title = c.hold ? "Take a second look, then decide" : "Decide on this CV";
      if (op && next) {
        acts = compact([
          { t: "move", to: next.id, label: "Pass & move to " + nextLabel, icon: "check", primary: true, decision: true },
          c.sub === s.def && s.subs.includes("Consider") ? { t: "consider", sub: "Consider", label: "Consider", icon: "scale" } : null,
          s.fail ? { t: "fail", sub: s.fail, label: "Not pass", icon: "x" } : null,
          c.st === "error" ? { t: "rescore", label: "Rescore", icon: "rotate-ccw" } : null,
        ]);
      }
    }
  } else if (kind === "iv") {
    const rounds = (s.rounds ?? []).map((r) => r.name);
    const ri = Math.max(0, rounds.indexOf(c.round ?? ""));
    const rnd = rounds[ri] ?? s.label;
    const nextRnd = rounds[ri + 1];
    // BR-INT-10: a no-show session counts as not held; the round goes back to scheduling.
    const noShow = !!o.sched?.noShow;
    const cur = noShow ? null : o.sched ?? null;
    const mgr = k === "hr" || k === "rc";
    const ivMe = k === "iv" || !!o.viewerIsIv;
    const held = !!cur && (!!c.noNote || !!cur.past);
    // BR-INT-07: with a real session, notes are in once it is Completed (every seat submitted).
    const notesIn = !!c.ivDone || (held && (cur?.done !== undefined ? cur.done : !c.noNote));
    steps = [
      ...rounds.slice(0, ri).map((r) => st(r, "done", P.ivs(), "Notes in")),
      st("Schedule " + rnd, cur ? "done" : "now", P.sch(c), noShow ? "No-show" : cur?.d),
      st(rnd + " notes", notesIn ? "done" : held ? "now" : "todo", P.ivs(o.ivName)),
      st(failed ? "Not passed" : passed ? "Passed" : "Pass, Consider or Not pass", failed ? "fail" : passed ? "done" : notesIn ? "now" : "todo", P.ch),
      st("Move to " + nextLabel, "todo", P.ops(c)),
    ];
    const decideActs = (): Act[] => compact([
      next && adv ? { t: "move", to: next.id, label: "Pass & move to " + nextLabel, icon: "check", primary: true, decision: true } : null,
      c.sub !== "Consider" && s.subs.includes("Consider") && adv ? { t: "consider", sub: "Consider", label: "Consider", icon: "scale" } : null,
      s.fail && adv ? { t: "fail", sub: s.fail, label: "Not pass", icon: "x" } : null,
    ]);
    if (failed) { ended = true; title = "Did not pass " + s.label; acts = compact([reopen()]); }
    else if (passed) {
      owner = P.ops(c); title = "Ready to move to " + nextLabel;
      if (next) acts = compact([moveTo(next.id, nextLabel)]);
      // BR-INT-03: after a Pass, HR/Recruiter may schedule the next round instead.
      if (nextRnd && mgr) acts = [...acts, { t: "nextRound", label: "Schedule " + nextRnd, icon: "calendar-plus" }];
    } else if (!cur && !notesIn) {
      owner = P.sch(c); title = (noShow ? "No-show · Schedule " : "Schedule ") + rnd;
      acts = compact([
        mgr ? { t: "sched", label: "Schedule " + rnd, icon: "calendar-plus", primary: true } : null,
        c.sub === "Consider" && dec ? decideActs()[0] : null,
        reject(), back(),
      ]);
    } else if (!held && !notesIn) {
      owner = P.ivs(o.ivName); title = rnd + " · " + cur?.d;
      if (ivMe) acts = [{ t: "interview", label: "Prepare in interview mode", icon: "clipboard-pen", primary: true }];
      else if (mgr) acts = [{ t: "resched", label: "Reschedule", icon: "history" }];
      acts = compact([...acts, reject()]);
    } else if (!notesIn) {
      owner = P.ivs(o.ivName); title = "Waiting for " + rnd + " notes";
      if (ivMe) acts = [{ t: "interview", label: o.viewerIsIv ? "Create interview notes" : "Write your notes", icon: "pen-line", primary: true }];
      else if (op) acts = [{ t: "remind", label: "Remind interviewer", icon: "bell", who: o.ivName }];
      // BR-INT-09: HR, Recruiters and invited interviewers can record a no-show once the session has started.
      if (cur?.past && (mgr || ivMe)) acts = [...acts, { t: "noShow", label: "Mark no-show", icon: "user-x" }];
      acts = compact([...acts, reject()]);
    } else {
      owner = P.ch; title = "Decide after " + rnd;
      // BR-INT-03: the Chapter Head decides; HR/Recruiter schedules the next round once it is Pass or Consider.
      const goOn = nextRnd && (c.sub === s.pass || c.sub === "Consider");
      acts = compact([
        goOn && mgr ? { t: "nextRound", label: "Schedule " + nextRnd, icon: "calendar-plus", primary: true } : null,
        ...(adv ? decideActs() : []),
      ]);
    }
  } else if (kind === "offer") {
    const rejected = c.sub === s.fail && !!s.fail;
    const accepted = !!o.accepted;
    const sub = c.sub;
    const matched = sub === "Matched", offered = sub === s.pass;
    steps = [
      st("Terms agreed", matched || offered ? "done" : "now", P.hr, "Salary, start date"),
      st("Offer letter sent", offered ? "done" : matched ? "now" : "todo", P.hr),
      st(rejected ? "Candidate rejected" : "Candidate accepted", rejected ? "fail" : accepted ? "done" : offered ? "now" : "todo", P.cand),
      st("Company approval", accepted ? "now" : "todo", P.ch, "Confirms the hire"),
    ];
    if (rejected) { ended = true; title = "Offer rejected by the candidate"; acts = compact([reopen(k === "hr")]); }
    else if (!matched && !offered) {
      owner = P.hr; title = "Agree terms with the candidate";
      if (k === "hr") acts = compact([
        { t: "sub", sub: "Matched", label: "Mark terms agreed", icon: "handshake", primary: true },
        s.fail ? { t: "fail", sub: s.fail, label: "Candidate rejected", icon: "x" } : null,
        back(),
      ]);
    } else if (matched) {
      owner = P.hr; title = "Send the offer letter";
      if (k === "hr") acts = compact([
        { t: "sub", sub: s.pass, label: "Send offer letter", icon: "send", primary: true },
        s.fail ? { t: "fail", sub: s.fail, label: "Candidate rejected", icon: "x" } : null,
      ]);
    } else if (!accepted) {
      owner = { ...P.cand, keys: ["hr"] }; title = "Waiting for the candidate's answer";
      if (k === "hr") acts = compact([
        { t: "patch", patch: { accepted: true }, msg: "Acceptance recorded", label: "Record acceptance", icon: "circle-check", primary: true },
        s.fail ? { t: "fail", sub: s.fail, label: "Candidate rejected", icon: "x" } : null,
      ]);
    } else {
      owner = P.ch; title = "Confirm the hire";
      acts = compact([
        dec && next ? { t: "move", to: next.id, label: "Approve & confirm hire", icon: "badge-check", primary: true, decision: true } : null,
        k === "hr" && s.fail ? { t: "fail", sub: s.fail, label: "Candidate withdrew", icon: "x" } : null,
      ]);
    }
  } else if (kind === "prob") {
    const find = (re: RegExp) => s.subs.find((x) => re.test(x));
    const fromSub = (): "awaiting" | "active" | "decision" | "passed" | "ended" => {
      if (/not pass|ended|did not|fail|reject/i.test(c.sub)) return "ended";
      if (/review/i.test(c.sub)) return "decision";
      if (/pass/i.test(c.sub)) return "passed";
      if (/progress|active|started/i.test(c.sub)) return "active";
      return "awaiting";
    };
    const p = o.probation ?? { status: fromSub() };
    const order = ["awaiting", "active", "decision", "passed"];
    const pi = order.indexOf(p.status);
    const mentor = { keys: ["mentor"], name: o.mentor || "Mentor", role: "Mentor" };
    steps = [
      st("Start confirmed", pi > 0 ? "done" : "now", P.hr),
      st("Mentor review", pi > 1 ? "done" : pi === 1 ? "now" : "todo", mentor),
      st("Decision", pi > 2 ? "done" : pi === 2 ? "now" : "todo", P.ch),
      st("Move to Official", pi === 3 ? "now" : "todo", P.hr),
    ];
    if (p.status === "awaiting") {
      owner = P.hr; title = "Confirm the first working day" + (p.planned ? " · planned " + p.planned : "");
      const noStart = find(/did not/i);
      if (k === "hr") acts = compact([
        { t: "prob", act: "start", sub: find(/progress|active|started/i) ?? s.pass, label: "Confirm start", icon: "log-in", primary: true },
        noStart ? { t: "prob", act: "nostart", sub: noStart, label: "Did not start", icon: "user-x" } : null,
      ]);
    } else if (p.status === "active") {
      owner = mentor; title = "Mentor review due" + (p.daysLeft != null ? ` · ${p.daysLeft} days left` : "");
      const early = find(/ended early|early/i);
      if (dec) acts = compact([
        { t: "prob", act: "remind", label: "Remind mentor", icon: "bell", who: o.mentor ?? undefined },
        early ? { t: "prob", act: "early", sub: early, label: "End early", icon: "log-out" } : null,
      ]);
    } else if (p.status === "decision") {
      owner = P.ch; title = "Review submitted · decide";
      const notPass = s.notPass?.[0] ?? find(/not pass/i);
      if (dec) acts = compact([
        { t: "prob", act: "decide", sub: find(/^pass/i) ?? s.pass, label: "Mark passed", icon: "gavel", primary: true },
        notPass ? { t: "prob", act: "decide", sub: notPass, label: "Not pass", icon: "x" } : null,
      ]);
    } else if (p.status === "passed") {
      owner = P.hr; title = "Passed probation";
      if (k === "hr") acts = [{ t: "prob", act: "official", ...(next ? { to: next.id } : {}), label: "Move to Official", icon: "badge-check", primary: true }];
    } else { ended = true; title = "Probation ended"; }
  } else if (kind === "hired") {
    ended = true; title = "Official staff · read-only";
    steps = [st("Official", "done", P.hr)];
  } else {
    if (failed) {
      ended = true; title = "Did not pass " + s.label;
      steps = [st(s.label, "fail", P.ops(c))];
      acts = compact([reopen()]);
    } else {
      owner = P.ops(c); title = "Decide on " + s.label;
      steps = [st(s.label, "now", owner)];
      if (op) acts = compact([
        next && moveTo(next.id, nextLabel),
        c.sub === s.def && s.subs.includes("Consider") ? { t: "consider", sub: "Consider", label: "Consider", icon: "scale" } : null,
        s.fail ? { t: "fail", sub: s.fail, label: "Not pass", icon: "x" } : null,
        back(),
      ]);
    }
  }

  const mine = !ended && !!owner && ((owner as Owner).keys.includes(k) || (!!o.viewerIsIv && (owner as Owner).keys.includes("iv"))) && acts.length > 0;
  const ow = owner as Owner | null;
  const why = !ended && !mine && ow
    ? "Waiting on " + ow.name + (ow.role ? " · " + ow.role : "")
    : null;
  const hold = c.sub === "Consider" ? c.hold ?? null : null;
  return { steps, owner: ow, acts, title, ended, mine, why, hold };
}

const STATE_IC: Record<StepState, [string, string]> = {
  done: ["circle-check", "var(--success)"],
  now: ["circle-dot", "var(--green-700)"],
  todo: ["circle-dashed", "var(--neutral-400)"],
  fail: ["circle-x", "var(--danger)"],
};

export function NextStepPanel({ ns, render, compact }: { ns: NextStep; render?: (a: Act) => React.ReactNode; compact?: boolean }) {
  const tone = ns.ended ? "ended" : ns.mine ? "you" : "wait";
  const label = { ended: "Closed", you: "Your turn", wait: "Not your step" }[tone];
  const icon = { ended: "lock", you: "arrow-right-circle", wait: "hourglass" }[tone];
  return (
    <section className={"ns ns--" + tone} aria-label="Next step">
      <div className="ns__head">
        <span className="ns__tag"><Icon name={icon} size={14} />{label}</span>
        <b className="ns__title">{ns.title}</b>
        {ns.why && <span className="ns__why">{ns.why}</span>}
        <span className="ad-sp" />
        {!compact && render && ns.acts.length > 0 && <div className="ns__acts">{ns.acts.map((a, i) => <React.Fragment key={a.t + i}>{render(a)}</React.Fragment>)}</div>}
      </div>
      {ns.hold && (
        <div className="ns__hold"><Icon name="scale" size={16} /><span><b>On hold:</b> {ns.hold.what} · second look by {ns.hold.who}</span></div>
      )}
      {ns.steps.length > 0 && (
        <ol className="ns__steps">
          {ns.steps.map((x, i) => {
            const [ic, col] = STATE_IC[x.state];
            return (
              <li key={i} className={"ns__step is-" + x.state}>
                <Icon name={ic} size={16} style={{ color: col, flex: "none", marginTop: 1 }} />
                <span className="ns__sl">
                  <span className="ns__sn">{x.label}</span>
                  {x.note && <small>{x.note}</small>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function NextStepCell({ ns }: { ns: NextStep }) {
  if (ns.ended) return <div className="ns-cell ns-cell--ended">{ns.title}</div>;
  return (
    <div className={"ns-cell" + (ns.mine ? " ns-cell--you" : "")}>
      <span className="ns-cell__t">{ns.mine && <Icon name="arrow-right-circle" size={14} />}{ns.title}</span>
      <small>{ns.mine ? "You" : ns.owner?.name}</small>
    </div>
  );
}
