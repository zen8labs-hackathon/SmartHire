"use client";
// "What happens next" panel + list-cell, ported from the design's app-nextstep.jsx.
import * as React from "react";
import { STAGES, type Candidate, type Role, type RoleKey, type Stage } from "./data";
import { Icon } from "./ext";

export type StepState = "done" | "now" | "todo" | "fail";
export type Step = { label: string; state: StepState; owner?: Owner; note?: string };
type Owner = { keys: string[]; name: string; role?: string };
export type ActType =
  | "move" | "propose" | "passPropose" | "consider" | "fail" | "rescore" | "sched" | "interview" | "resched"
  | "remind" | "nextRound" | "sub" | "patch" | "prob" | "approve" | "decline" | "withdraw";
export type Act = {
  t: ActType; label: string; icon: string; primary?: boolean; decision?: boolean;
  to?: string; sub?: string; patch?: Record<string, unknown>; msg?: string; who?: string; act?: string;
};
export type NextStep = {
  steps: Step[]; owner: Owner | null; acts: Act[]; title: string; ended: boolean; mine: boolean;
  why: string | null; hold: { what: string; who: string } | null; prop: Candidate["proposal"] | null;
};
export type NextStepOpts = {
  /** Must-have criteria counts (met / total) for the CV step note. */
  mustHaves?: { met: number; total: number } | null;
  /** Current interview schedule, if any. */
  sched?: { d: string; past?: boolean } | null;
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
  ch: { keys: ["ch", "hr"], name: "Trần Quang Huy", role: "Chapter Head" } as Owner,
  hr: { keys: ["hr"], name: "Nguyễn Thị Hiền", role: "HR" } as Owner,
  sys: { keys: [], name: "System", role: "AI scoring" } as Owner,
  cand: { keys: [], name: "Candidate", role: "recorded by HR" } as Owner,
  ops: (c: Candidate): Owner => ({ keys: ["hr", "ch", "rc"], name: c.owner, role: "Recruiter / HR" }),
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
  const op = dec || k === "rc";
  const prop = c.proposal ?? null;
  const rc = k === "rc";
  const failed = c.sub === s.fail && !!s.fail;
  const passed = c.sub === s.pass;
  const nextLabel = next?.label ?? "next stage";

  const moveTo = (to: string, label: string): Act | null =>
    dec ? { t: "move", to, label: "Move to " + label, icon: "arrow-right", primary: true }
      : rc ? { t: "propose", to, label: "Propose move to " + label, icon: "send", primary: true } : null;
  const compact = (a: (Act | null | false)[]) => a.filter(Boolean) as Act[];

  let steps: Step[] = [], owner: Owner | null = null, acts: Act[] = [], title = "", ended = false;

  const proposalFlow = () => {
    const toLabel = prop && (prop.to === "reject" ? "Rejected" : stages.find((x) => x.id === prop.to)?.label ?? nextLabel);
    owner = P.ch;
    if (dec) {
      title = "Approve move to " + toLabel;
      acts = [
        { t: "approve", label: "Approve · move to " + toLabel, icon: "check", primary: true, to: prop?.to },
        { t: "decline", label: "Decline proposal", icon: "x" },
      ];
    } else if (rc && prop && c.owner === prop.by) {
      title = "Proposed move to " + toLabel;
      acts = [{ t: "remind", label: "Remind Huy", icon: "bell", who: "Huy" }, { t: "withdraw", label: "Withdraw", icon: "undo-2" }];
    } else title = "Proposed move to " + toLabel;
  };

  if (kind === "cv") {
    const mh = o.mustHaves;
    const scored = c.st === "done", err = c.st === "error";
    steps = [
      st(err ? "AI scoring failed" : scored ? "CV scored" : "AI scoring", err ? "fail" : scored ? "done" : "now", P.sys,
        err ? "Rescore or review manually" : scored ? (c.band === "review" ? "No band · manual review" : undefined) : "In progress"),
      st("Must-haves checked", scored ? "done" : "todo", P.sys, mh ? `${mh.met} of ${mh.total} met` : undefined),
      st(failed ? "Not passed" : passed ? "Passed" : "Pass, Consider or Not pass", failed ? "fail" : passed ? "done" : scored || err ? "now" : "todo", P.ops(c)),
      st("Move to " + nextLabel, prop ? "now" : "todo", P.ch, prop ? "Proposed by " + prop.by : undefined),
    ];
    if (failed) { ended = true; title = "Did not pass " + s.label; }
    else if (prop) proposalFlow();
    else if (passed) {
      owner = P.ch; title = "Ready to move to " + nextLabel;
      if (next) acts = compact([moveTo(next.id, nextLabel)]);
    } else {
      owner = P.ops(c);
      title = c.hold ? "Take a second look, then decide" : "Decide on this CV";
      if (op && next) {
        acts = compact([
          dec ? { t: "move", to: next.id, label: "Pass & move to " + nextLabel, icon: "check", primary: true, decision: true }
            : { t: "passPropose", to: next.id, label: "Pass & propose " + nextLabel, icon: "send", primary: true },
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
    const cur = o.sched ?? null;
    const held = !!cur && (!!c.noNote || !!cur.past);
    const notesIn = (held && !c.noNote) || !!c.ivDone;
    steps = [
      ...rounds.slice(0, ri).map((r) => st(r, "done", P.ivs(), "Notes in")),
      st("Schedule " + rnd, cur ? "done" : "now", P.ops(c), cur?.d),
      st(rnd + " notes", notesIn ? "done" : held ? "now" : "todo", P.ivs(o.ivName)),
      st(failed ? "Not passed" : passed ? "Passed" : "Pass, Consider or Not pass", failed ? "fail" : passed ? "done" : notesIn ? "now" : "todo", P.ch),
      st("Move to " + nextLabel, prop ? "now" : "todo", P.ch),
    ];
    const decideActs = (): Act[] => compact([
      next && dec ? { t: "move", to: next.id, label: "Pass & move to " + nextLabel, icon: "check", primary: true, decision: true } : null,
      nextRnd && dec ? { t: "nextRound", label: "Schedule " + nextRnd, icon: "calendar-plus" } : null,
      c.sub !== "Consider" && s.subs.includes("Consider") && dec ? { t: "consider", sub: "Consider", label: "Consider", icon: "scale" } : null,
      s.fail && dec ? { t: "fail", sub: s.fail, label: "Not pass", icon: "x" } : null,
    ]);
    if (failed) { ended = true; title = "Did not pass " + s.label; }
    else if (prop) proposalFlow();
    else if (passed) {
      owner = P.ch; title = "Ready to move to " + nextLabel;
      if (next) acts = compact([moveTo(next.id, nextLabel)]);
    } else if (!cur && !notesIn) {
      owner = P.ops(c); title = "Schedule " + rnd;
      if (op) acts = compact([{ t: "sched", label: "Schedule " + rnd, icon: "calendar-plus", primary: true }, c.sub === "Consider" && dec ? decideActs()[0] : null]);
    } else if (!held && !notesIn) {
      owner = P.ivs(o.ivName); title = rnd + " · " + cur?.d;
      if (k === "iv") acts = [{ t: "interview", label: "Prepare in interview mode", icon: "clipboard-pen", primary: true }];
      else if (op) acts = [{ t: "resched", label: "Reschedule", icon: "history" }];
    } else if (!notesIn) {
      owner = P.ivs(o.ivName); title = "Waiting for " + rnd + " notes";
      if (k === "iv") acts = [{ t: "interview", label: "Write your notes", icon: "pen-line", primary: true }];
      else if (op) acts = [{ t: "remind", label: "Remind interviewer", icon: "bell", who: o.ivName }];
    } else {
      owner = P.ch; title = "Decide after " + rnd;
      acts = dec ? decideActs() : rc ? [{ t: "remind", label: "Remind Huy", icon: "bell", who: "Huy" }] : [];
    }
    if (k === "iv" && c.ivDone && !ended && !passed) { title = "Your notes are submitted"; owner = P.ch; acts = []; }
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
    if (rejected) { ended = true; title = "Offer rejected by the candidate"; }
    else if (prop) proposalFlow();
    else if (!matched && !offered) {
      owner = P.hr; title = "Agree terms with the candidate";
      if (k === "hr") acts = compact([
        { t: "sub", sub: "Matched", label: "Mark terms agreed", icon: "handshake", primary: true },
        s.fail ? { t: "fail", sub: s.fail, label: "Candidate rejected", icon: "x" } : null,
      ]);
    } else if (matched) {
      owner = P.hr; title = "Send the offer letter";
      if (k === "hr") acts = [{ t: "sub", sub: s.pass, label: "Send offer letter", icon: "send", primary: true }];
    } else if (!accepted) {
      owner = { ...P.cand, keys: ["hr"] }; title = "Waiting for the candidate's answer";
      if (k === "hr") acts = compact([
        { t: "patch", patch: { accepted: true }, msg: "Acceptance recorded", label: "Record acceptance", icon: "circle-check", primary: true },
        s.fail ? { t: "fail", sub: s.fail, label: "Candidate rejected", icon: "x" } : null,
      ]);
    } else {
      owner = P.ch; title = "Confirm the hire";
      if (dec && next) acts = [{ t: "move", to: next.id, label: "Approve & confirm hire", icon: "badge-check", primary: true, decision: true }];
    }
  } else if (kind === "prob") {
    const p = o.probation ?? { status: "awaiting" as const };
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
      if (k === "hr") acts = [{ t: "prob", act: "start", label: "Confirm start", icon: "log-in", primary: true }];
    } else if (p.status === "active") {
      owner = mentor; title = "Mentor review due" + (p.daysLeft != null ? ` · ${p.daysLeft} days left` : "");
      if (dec) acts = [{ t: "prob", act: "remind", label: "Remind mentor", icon: "bell" }];
    } else if (p.status === "decision") {
      owner = P.ch; title = "Review submitted · decide";
      if (dec) acts = [{ t: "prob", act: "decide", label: "Decide", icon: "gavel", primary: true }];
    } else if (p.status === "passed") {
      owner = P.hr; title = "Passed probation";
      if (k === "hr") acts = [{ t: "prob", act: "official", label: "Move to Official", icon: "badge-check", primary: true }];
    } else { ended = true; title = "Probation ended"; }
  } else if (kind === "hired") {
    ended = true; title = "Official staff · read-only";
    steps = [st("Official", "done", P.hr)];
  } else {
    owner = P.ops(c); title = "Decide on " + s.label;
    steps = [st(s.label, "now", owner)];
    if (prop) proposalFlow();
    else if (op && next) acts = compact([moveTo(next.id, nextLabel)]);
  }

  const mine = !ended && !!owner && (owner as Owner).keys.includes(k) && acts.length > 0;
  const ow = owner as Owner | null;
  const why = !ended && !mine && ow
    ? (prop && rc ? "You proposed this · " : "") + "Waiting on " + ow.name + (ow.role ? " · " + ow.role : "")
    : null;
  const hold = c.sub === "Consider" ? c.hold ?? null : null;
  return { steps, owner: ow, acts, title, ended, mine, why, hold, prop };
}

const STATE_IC: Record<StepState, [string, string]> = {
  done: ["circle-check", "var(--success)"],
  now: ["circle-dot", "var(--green-700)"],
  todo: ["circle-dashed", "var(--neutral-400)"],
  fail: ["circle-x", "var(--danger)"],
};

export function NextStepPanel({ ns, render, compact }: { ns: NextStep; render?: (a: Act) => React.ReactNode; compact?: boolean }) {
  const tone = ns.ended ? "ended" : ns.prop && ns.mine ? "prop" : ns.mine ? "you" : "wait";
  const label = { ended: "Closed", prop: "Needs your approval", you: "Your turn", wait: "Not your step" }[tone];
  const icon = { ended: "lock", prop: "inbox", you: "arrow-right-circle", wait: "hourglass" }[tone];
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
                  {(x.owner || x.note) && <small>{x.owner?.name}{x.note ? (x.owner ? " · " : "") + x.note : ""}</small>}
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
