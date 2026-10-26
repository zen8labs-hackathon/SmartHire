"use client";
import * as React from "react";
import type { FullConversionPlan as ConversionPlan } from "@/lib/migration/convert-job";
import type { DataDecisions } from "@/lib/migration/job-data-plan";
import type { MigrationOptions } from "@/lib/migration/migration-queries";
import { Banner, Button, Dialog, Select } from "./ext";

type Props = { jobUuid: string; jobTitle: string; onClose: () => void; onDone: () => void };

const STEPS = ["Pipeline", "Map stages", "Calendar", "Review"];
const base = (id: string) => `/api/admin/migration/jobs/${id}`;
const JSON_HEADERS = { "Content-Type": "application/json" };

type ApiErr = { error?: string; code?: string; plan?: ConversionPlan };
async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: ApiErr & { plan?: ConversionPlan } }> {
  const res = await fetch(url, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as ApiErr;
  return { ok: res.ok, status: res.status, data };
}

type PanelProps = {
  plan: ConversionPlan; data: DataDecisions; setData: React.Dispatch<React.SetStateAction<DataDecisions>>;
  officeSel: Set<string> | null; setOfficeSel: (s: Set<string>) => void; disabled: boolean;
};

const shortId = (id: string) => `…${id.slice(-4)}`;
const fmt = (iso: string) => new Date(iso).toLocaleString();

/** HR decisions for data that cannot be classified automatically (hire type, interview mode, evaluations). */
function DataDecisionsPanel({ plan, data, setData, officeSel, setOfficeSel, disabled }: PanelProps) {
  const d = plan.data;
  const proposed = d.mode.proposedOffice;
  const sel = officeSel ?? new Set(proposed.map((p) => p.scheduleId));
  const ambiguous = d.evaluations.proposals.filter((p) => p.kind === "ambiguous");
  const autoMarks = d.evaluations.proposals.filter((p) => p.kind === "auto").length;
  if (!d.hireType.needsDecision && proposed.length === 0 && ambiguous.length === 0 && autoMarks === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {d.hireType.needsDecision && (
        <Select label={`Hire type “${d.hireType.current}” is not recognised`} value={data.hireType ?? ""} disabled={disabled}
          onChange={(e) => { const v = e.target.value; setData((x) => ({ ...x, hireType: v ? (v as "New hire" | "Replacement") : undefined })); }}
          options={[{ value: "", label: "Select…" }, { value: "New hire", label: "New hire" }, { value: "Replacement", label: "Replacement" }]} />
      )}
      {proposed.length > 0 && (
        <Banner tone={d.mode.needsReview ? "warning" : "info"} icon="calendar" title="Interviews with a location but no link">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span>Tick the interviews held in the office. The rest stay online.</span>
            {proposed.map((p) => (
              <label key={p.scheduleId} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={sel.has(p.scheduleId)} disabled={disabled}
                  onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(p.scheduleId); else n.delete(p.scheduleId); setOfficeSel(n); }} />
                {fmt(p.scheduledAt)} · {p.location}
              </label>
            ))}
            <div><Button variant="secondary" disabled={disabled} onClick={() => { setOfficeSel(sel); setData((x) => ({ ...x, officeScheduleIds: [...sel] })); }}>
              {data.officeScheduleIds ? "Update selection" : "Confirm selection"}
            </Button></div>
          </div>
        </Banner>
      )}
      {(ambiguous.length > 0 || autoMarks > 0) && (
        <Banner tone="info" icon="check" title="Submitted evaluations">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {autoMarks > 0 && <span>{autoMarks} evaluation{autoMarks === 1 ? "" : "s"} matched an interviewer automatically.</span>}
            {ambiguous.map((p) => {
              const cur = data.evaluationChoices?.[p.reviewId];
              const val = cur === undefined ? "" : cur === null ? "skip" : `${cur.scheduleId}:${cur.profileId}`;
              return (
                <Select key={p.reviewId} label={`Evaluation of ${fmt(p.submittedAt)} — who submitted it?`} value={val} disabled={disabled}
                  onChange={(e) => {
                    const v = e.target.value;
                    setData((x) => {
                      const choices = { ...(x.evaluationChoices ?? {}) };
                      if (!v) delete choices[p.reviewId];
                      else if (v === "skip") choices[p.reviewId] = null;
                      else { const [scheduleId, profileId] = v.split(":"); choices[p.reviewId] = { scheduleId, profileId }; }
                      return { ...x, evaluationChoices: choices };
                    });
                  }}
                  options={[{ value: "", label: "Select…" }, { value: "skip", label: "Skip (do not mark)" },
                    ...(p.options ?? []).map((o) => ({ value: `${o.scheduleId}:${o.profileId}`, label: `Interviewer ${shortId(o.profileId)} · interview #${o.scheduleId}` }))]} />
              );
            })}
          </div>
        </Banner>
      )}
    </div>
  );
}

/** One-way, per-job conversion of a legacy position to the new pipeline flow. */
export function MigrateWizard({ jobUuid, jobTitle, onClose, onDone }: Props) {
  const [opts, setOpts] = React.useState<MigrationOptions | null>(null);
  const [loadErr, setLoadErr] = React.useState<string | null>(null);
  const [step, setStep] = React.useState(0);
  const [pipelineId, setPipelineId] = React.useState("");
  const [pairs, setPairs] = React.useState<Record<string, string>>({});
  const [probation, setProbation] = React.useState("");
  const [plan, setPlan] = React.useState<ConversionPlan | null>(null);
  const [data, setData] = React.useState<DataDecisions>({});
  const [officeSel, setOfficeSel] = React.useState<Set<string> | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    const ac = new AbortController();
    fetch(`${base(jobUuid)}/options`, { signal: ac.signal })
      .then(async (r) => { if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as ApiErr).error ?? "Could not load conversion options."); return (await r.json()) as MigrationOptions; })
      .then(setOpts)
      .catch((e) => { if (!ac.signal.aborted) setLoadErr(e instanceof Error ? e.message : "Could not load conversion options."); });
    return () => ac.abort();
  }, [jobUuid]);

  const pipeline = opts?.pipelines.find((p) => p.id === pipelineId);

  // Pre-fill the mapping: keep an existing link to a row of this pipeline, else match by stage.
  const choosePipeline = (id: string) => {
    setPipelineId(id); setPlan(null); setErr(null); setProbation("");
    const p = opts?.pipelines.find((x) => x.id === id);
    const next: Record<string, string> = {};
    for (const m of opts?.mappings ?? []) {
      const row = p?.rows.find((r) => r.id === m.pipelineRowId) ?? p?.rows.find((r) => r.pipelineStageId === m.pipelineStageId);
      if (row) next[m.id] = row.id;
    }
    setPairs(next);
  };

  const body = () => ({
    pipelineId,
    pairs: Object.entries(pairs).filter(([, r]) => r).map(([oldMappingId, pipelineRowId]) => ({ oldMappingId, pipelineRowId })),
    ...(probation ? { probationStageId: probation } : {}),
    ...(Object.keys(data).length > 0 ? { data } : {}),
  });

  // Re-run the preview whenever HR changes a data decision on the review step.
  const firstRun = React.useRef(true);
  React.useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    if (step === 3) void preview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const preview = async () => {
    setBusy(true); setErr(null);
    const r = await post(`${base(jobUuid)}/dry-run`, body());
    setBusy(false);
    if (!r.ok) { setErr(r.data.error ?? "Could not build the preview."); return; }
    setPlan((r.data as { plan: ConversionPlan }).plan);
    setStep(3);
  };

  const apply = async () => {
    if (!plan) return;
    setBusy(true); setErr(null);
    const r = await post(`${base(jobUuid)}/apply`, { ...body(), fingerprint: plan.fingerprint });
    setBusy(false);
    if (r.ok) { onDone(); return; }
    if (r.data.plan) setPlan(r.data.plan);
    setErr(r.status === 409 && r.data.code === "STALE_PLAN"
      ? "Configuration changed since the preview. The preview was refreshed — review it again."
      : r.data.error ?? "Conversion failed.");
  };

  const mappings = opts?.mappings ?? [];
  const mapped = mappings.every((m) => pairs[m.id]) ;
  const usedRows = Object.values(pairs).filter(Boolean);
  const dup = new Set(usedRows).size !== usedRows.length;

  let content: React.ReactNode;
  let primary: React.ReactNode;
  if (loadErr) {
    content = <Banner tone="danger" icon="alert-triangle" title="Could not load">{loadErr}</Banner>;
  } else if (!opts) {
    content = <div style={{ padding: 16 }}>Loading…</div>;
  } else if (step === 0) {
    content = opts.pipelines.length === 0 ? (
      <Banner tone="warning" icon="alert-triangle" title="No pipeline available">Create a pipeline with at least one stage first, then come back to convert this position.</Banner>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0 }}>Choose the pipeline this position will use from now on. The conversion cannot be undone.</p>
        <Select label="New pipeline" value={pipelineId} onChange={(e) => choosePipeline(e.target.value)}
          options={[{ value: "", label: "Select a pipeline…" }, ...opts.pipelines.map((p) => ({ value: p.id, label: `${p.name} (${p.rows.length} stages)` }))]} />
        {pipeline && <div style={{ fontSize: 13, opacity: 0.8 }}>{pipeline.rows.map((r) => r.label).join(" → ")}</div>}
      </div>
    );
    primary = opts.pipelines.length === 0
      ? <Button icon="external-link" onClick={() => { window.location.href = "/admin/pipelines-2"; }}>Open Pipelines page</Button>
      : <Button disabled={!pipelineId} onClick={() => setStep(1)}>Next</Button>;
  } else if (step === 1) {
    content = (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ margin: 0 }}>Match each current stage to a stage of “{pipeline?.name}”. Candidates move with their stage.</p>
        {mappings.map((m) => (
          <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "center" }}>
            <div>{m.label}{m.stageDeleted ? " (deleted)" : ""} <span style={{ opacity: 0.6 }}>· {m.candidates} candidate{m.candidates === 1 ? "" : "s"}</span></div>
            <Select aria-label={`New stage for ${m.label}`} value={pairs[m.id] ?? ""} onChange={(e) => { setPlan(null); setPairs((p) => ({ ...p, [m.id]: e.target.value })); }}
              options={[{ value: "", label: "Select…" }, ...(pipeline?.rows ?? []).map((r) => ({ value: r.id, label: r.label }))]} />
          </div>
        ))}
        {dup && <Banner tone="warning" icon="alert-triangle" title="Two stages share one target">Each current stage needs its own stage in the new pipeline.</Banner>}
        <Select label="Probation stage (optional)" value={probation} onChange={(e) => { setPlan(null); setProbation(e.target.value); }}
          options={[{ value: "", label: "Keep as is" }, ...(pipeline?.rows ?? []).map((r) => ({ value: r.pipelineStageId, label: r.label }))]}
          hint="Hired dates are recalculated from the probation stage." />
      </div>
    );
    primary = <Button disabled={!mapped || dup} onClick={() => setStep(2)}>Next</Button>;
  } else if (step === 2) {
    content = (
      <Banner tone="info" icon="calendar" title="Interview schedules move to Calendar">
        {opts.scheduledInterviews > 0
          ? `${opts.scheduledInterviews} scheduled interview${opts.scheduledInterviews === 1 ? "" : "s"} for this position will appear in Calendar after conversion.`
          : "This position has no scheduled interviews."}
        {" "}Past interviews and their history are kept as they are.
      </Banner>
    );
    primary = <Button disabled={busy} onClick={() => void preview()}>{busy ? "Building preview…" : "Preview changes"}</Button>;
  } else {
    const moved = plan?.repoints.length ?? 0;
    content = plan ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div><b>{jobTitle}</b> → <b>{pipeline?.name}</b></div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>{moved} candidate{moved === 1 ? "" : "s"} will be moved to the new stages.</li>
          <li>{plan.hiredAtChanges.length} hired date{plan.hiredAtChanges.length === 1 ? "" : "s"} will change.</li>
          <li>{plan.mode === "in_place" ? "Stages already match; no candidate needs to move." : "Stages are re-created from the new pipeline."}</li>
        </ul>
        <DataDecisionsPanel plan={plan} data={data} setData={setData} officeSel={officeSel} setOfficeSel={setOfficeSel} disabled={busy} />
        {plan.probationOtherJobs.length > 0 && <Banner tone="warning" icon="alert-triangle" title="Affects other positions">Marking this stage as probation also affects: {plan.probationOtherJobs.map((j) => j.position).join(", ")}.</Banner>}
        {plan.blockers.length > 0 && <Banner tone="danger" icon="alert-triangle" title="Cannot convert yet"><ul style={{ margin: 0, paddingLeft: 18 }}>{plan.blockers.map((b, i) => <li key={i}>{b.message}</li>)}</ul></Banner>}
        {plan.warnings.length > 0 && <Banner tone="warning" icon="alert-triangle" title="Please note"><ul style={{ margin: 0, paddingLeft: 18 }}>{plan.warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul></Banner>}
        <Banner tone="info" icon="archive" title="This cannot be undone">The old structure is replaced for this position only.</Banner>
      </div>
    ) : <div style={{ padding: 16 }}>No preview.</div>;
    primary = <Button icon="check" disabled={busy || !plan || plan.blockers.length > 0} onClick={() => void apply()}>{busy ? "Converting…" : "Confirm conversion"}</Button>;
  }

  return (
    <Dialog title="Convert to the new structure" description={`${jobTitle} · step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`} width={640} onClose={busy ? undefined : onClose}
      footer={<>
        {step > 0 && <Button variant="secondary" disabled={busy} onClick={() => { setErr(null); setStep(step - 1); }}>Back</Button>}
        <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        {primary}
      </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {content}
        {err && <Banner tone="danger" icon="alert-triangle" title="Something went wrong">{err}</Banner>}
      </div>
    </Dialog>
  );
}
