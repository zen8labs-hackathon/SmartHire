"use client";
// Original CV ⇄ parsed data side-by-side, backed by the real CV file, versions and parsed payload.
import { useCallback, useEffect, useRef, useState } from "react";
import { CvViewer } from "@/components/admin/candidates/cv-viewer";
import { cvFileUrl, fetchCandidateCv, fetchCvHistory, saveCvEdits } from "./api";
import type { CandidateCv, CvEdit, CvVersionItem } from "./api";
import type { Candidate, Role } from "./data";
import { Banner, Button, Icon, Tabs, lsGet, lsSet } from "./ext";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
const today = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

type FStatus = "ai" | "confirmed" | "edited" | "missing";
type Field = { id: string; label: string; v: string; st: FStatus; score?: boolean; editable: boolean; by?: string; at?: string };

const FIELD_LABEL: Record<string, string> = {
  role: "Role", degree: "Degree", education: "School", experienceYears: "Experience", englishLevel: "English",
  gpa: "GPA", studentYears: "Student years", dateOfBirth: "Date of birth", skills: "Skills",
};
const GROUPS: [string, string][] = [["overview", "Overview"], ["skills", "Skills"], ["edu", "Education & language"], ["other", "Other"]];
const ST: Record<FStatus, [string, string]> = { ai: ["AI read", "sparkles"], confirmed: ["Confirmed", "circle-check"], edited: ["Edited", "pencil"], missing: ["Not found", "circle-dashed"] };
const FieldChip = ({ st }: { st: FStatus }) => (
  <span className={`chip-st chip-st--${st}`}><Icon name={ST[st][1]} size={11} />{ST[st][0]}</span>
);

function buildFields(cv: CandidateCv): Record<string, Field[]> {
  const edited = cv.sourceEvent === "manual_edit";
  const f = (id: string, v: string | null, extra: Partial<Field> = {}): Field => ({
    id, label: FIELD_LABEL[id], v: v ?? "", st: v ? (edited && cv.diff.includes(id) ? "edited" : "ai") : "missing", editable: false, ...extra,
  });
  const x = cv.fields;
  return {
    overview: [
      f("role", x.role, { score: true, editable: true }),
      f("experienceYears", x.experienceYears, { score: true, editable: true }),
    ],
    edu: [
      f("degree", x.degree, { editable: true }),
      f("education", x.education, { editable: true }),
      f("englishLevel", x.englishLevel, { score: true }),
    ],
    other: [f("gpa", x.gpa), f("studentYears", x.studentYears), f("dateOfBirth", x.dateOfBirth)].filter((r) => r.st !== "missing"),
  };
}

type FieldRowProps = { f: Field; hr: boolean; busy: boolean; onConfirm: () => void; onEdit: (v: string) => void };
function FieldRow({ f, hr, busy, onConfirm, onEdit }: FieldRowProps) {
  const [ed, setEd] = useState(false);
  const [v, setV] = useState(f.v);
  const commit = () => { setEd(false); if (v.trim() !== f.v) onEdit(v.trim()); };
  return (
    <div className={`cvx-f${f.st === "ai" ? " is-ai" : ""}`}>
      <span className="cvx-f__l">{f.label}</span>
      <div className="cvx-f__v">
        {ed ? (
          <input autoFocus value={v} onChange={(e) => setV(e.target.value)} aria-label={`Edit ${f.label}`}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEd(false); }} />
        ) : f.st === "missing" ? <span style={{ color: "var(--muted)" }}>Not found in CV</span> : <span>{f.v}</span>}
        {f.st === "confirmed" && <small>Confirmed by {f.by} · {f.at}</small>}
        <span><FieldChip st={f.st} /></span>
      </div>
      <span className="cvx-f__a">
        {ed ? (
          <>
            <Button size="sm" onClick={commit}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEd(false)}>Cancel</Button>
          </>
        ) : (
          hr && (
            <>
              {f.st === "ai" && <button type="button" className="sh-iconbtn" title="Confirm value" aria-label={`Confirm ${f.label}`} onClick={onConfirm}><Icon name="check" size={16} /></button>}
              {f.editable && <button type="button" className="sh-iconbtn" disabled={busy} title="Edit value" aria-label={`Edit ${f.label}`} onClick={() => { setV(f.v); setEd(true); }}><Icon name="pencil" size={16} /></button>}
            </>
          )
        )}
      </span>
    </div>
  );
}

export type CVHl = { k?: string; label?: string; fields?: string[] } | null;
type Props = { c: Candidate; user: Role; hl?: CVHl; setHl?: (h: CVHl) => void; onRescore?: () => void; onQuote?: (t: string) => void };

export function CVSideBySide({ c, user, hl: hlProp, setHl: setHlProp, onRescore }: Props) {
  const caId = c.caId;
  const hr = user.key === "hr";
  const root = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  const [layout, setLayout0] = useState<string>(() => lsGet("cvx-layout", "split"));
  const setLayout = (l: string) => { setLayout0(l); lsSet("cvx-layout", l); };
  const [ratio, setRatio] = useState<number>(() => lsGet("cvx-ratio", 55));
  const [drag, setDrag] = useState(false);
  const [hist, setHist] = useState<CvVersionItem[]>([]);
  const [verId, setVerId] = useState<string | null>(null);
  const [cv, setCv] = useState<CandidateCv | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cmp, setCmp] = useState(false);
  const [confirmed, setConfirmed] = useState<Record<string, { by: string; at: string }>>({});
  const [onlyCheck, setOnlyCheck] = useState(false);
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [stale, setStale] = useState(false);
  const [editSkills, setEditSkills] = useState<string | null>(null);
  const [hlLocal, setHlLocal] = useState<CVHl>(null);
  const hl = setHlProp ? hlProp ?? null : hlLocal;
  const setHl = setHlProp ?? setHlLocal;

  const narrow = w < 720;
  const eff = narrow && layout === "split" ? "cv" : layout;

  useEffect(() => {
    if (!root.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(root.current);
    return () => ro.disconnect();
  }, []);

  const load = useCallback(async (version?: CvVersionItem, signal?: AbortSignal) => {
    if (!caId) return;
    setLoading(true);
    setErr(null);
    try {
      const h = version ? null : await fetchCvHistory(caId, signal);
      if (h) setHist(h);
      const target = version ?? h?.find((x) => x.isLatest) ?? h?.[0];
      const data = await fetchCandidateCv(caId, target?.versionNumber, signal);
      setCv(data);
      setVerId(target?.versionEventId ?? null);
      setConfirmed({});
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setErr(e instanceof Error ? e.message : "Could not load the CV.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [caId]);

  useEffect(() => {
    const ac = new AbortController();
    void load(undefined, ac.signal);
    return () => ac.abort();
  }, [load]);

  const save = async (edit: CvEdit, score: boolean) => {
    if (!caId) return;
    setBusy(true);
    setErr(null);
    try {
      await saveCvEdits(caId, edit);
      if (score) setStale(true);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the CV.");
    } finally {
      setBusy(false);
    }
  };

  const onEdit = (f: Field, v: string) => {
    if (f.id === "experienceYears") {
      const n = parseFloat(v);
      if (!Number.isFinite(n) || n < 0) return setErr("Experience must be a number of years.");
      return void save({ experience_years: n, change_summary: "Experience edited" }, true);
    }
    const key = f.id === "education" ? "school" : (f.id as "role" | "degree");
    void save({ [key]: v || null, change_summary: `${f.label} edited` }, !!f.score);
  };

  if (!caId) return <Banner tone="neutral" icon="info">This candidate has no CV on record.</Banner>;

  const fieldsByGroup = cv ? buildFields(cv) : {};
  const withConfirm = (f: Field): Field => (confirmed[f.id] && f.st === "ai" ? { ...f, st: "confirmed", ...confirmed[f.id] } : f);
  const keep = (f: Field) =>
    (!onlyCheck || ["ai", "missing"].includes(f.st)) &&
    (!q || fold(`${f.label} ${f.v}`).includes(fold(q))) &&
    (!hl?.fields || hl.fields.includes(f.id));
  const skills = cv?.fields.skills ?? [];
  const skillsShown = !!cv && (!hl?.fields || hl.fields.includes("skills")) && (!q || skills.some((s) => fold(s).includes(fold(q))));
  const toCheck = Object.values(fieldsByGroup).flat().filter((f) => ["ai", "missing"].includes(f.st)).length;
  const cur = hist.find((x) => x.versionEventId === verId);
  const canCompare = hist.length > 1 && !!cv && (cv.diff.length > 0 || !!cv.changeSummary);

  const docPane = (
    <div className="cvx-doc">
      {cv && !cv.isActive && <Banner tone="neutral" icon="info">CV v{cv.versionNumber} · {fmtDate(cv.createdAt)} · not used for scoring this application.</Banner>}
      <CvViewer key={verId ?? "active"} cvUrl={cvFileUrl(caId, verId ?? undefined)} title={cv?.filename ?? "Candidate CV"} style={{ width: "100%", height: "100%", minHeight: 480 }} />
    </div>
  );

  const dataPane = (
    <div className="cvx-data">
      {cmp && cv ? (
        <>
          <div className="cvx-data__bar"><b style={{ fontWeight: 600, fontSize: 13 }}>Changes in CV v{cv.versionNumber}</b><span className="ad-sp" /><Button size="sm" variant="ghost" icon="x" onClick={() => setCmp(false)}>Close comparison</Button></div>
          {cv.changeSummary && <div style={{ padding: "10px 14px", fontSize: 13, color: "var(--fg-2)" }}>{cv.changeSummary}</div>}
          <div className="cvx-cmp" style={{ gridTemplateColumns: "1fr" }}>
            {cv.diff.length === 0 ? <span style={{ color: "var(--muted)" }}>No parsed fields differ from the previous version.</span>
              : cv.diff.map((k) => (
                <span key={k}><b style={{ fontWeight: 600 }}>{FIELD_LABEL[k] ?? k}</b> changed · now {k === "skills" ? skills.join(", ") || "—" : String((cv.fields as Record<string, unknown>)[k] ?? "—")}</span>
              ))}
          </div>
          <div className="shx-small" style={{ padding: "10px 14px" }}>Compared with the previous version. Only fields that differ are shown.</div>
        </>
      ) : (
        <>
          <div className="cvx-data__bar">
            <input className="cvx-search" placeholder="Find a field" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a field" />
            <Button size="sm" variant={onlyCheck ? "secondary" : "ghost"} icon="list-checks" aria-pressed={onlyCheck} onClick={() => setOnlyCheck(!onlyCheck)}>To check · {toCheck}</Button>
            {hl?.fields && <span className="jb-achip">Fields for: {hl.label}<button type="button" aria-label="Clear" onClick={() => setHl(null)}><Icon name="x" size={12} /></button></span>}
          </div>
          {cv?.parsingStatus === "failed" && (
            <div style={{ padding: "10px 14px 0" }}><Banner tone="warning" icon="triangle-alert" title="This CV could not be parsed">{cv.parsingError ?? "Values below may be empty."}</Banner></div>
          )}
          {stale && (
            <div style={{ padding: "10px 14px 0" }}>
              <Banner tone="warning" icon="triangle-alert" title="The current score uses the old values"
                action={<Button size="sm" variant="secondary" icon="rotate-ccw" onClick={() => { setStale(false); onRescore?.(); }}>Rescore</Button>}>
                Edited fields are used for matching. Nothing is rescored automatically.
              </Banner>
            </div>
          )}
          {err && <div style={{ padding: "10px 14px 0" }}><Banner tone="danger" icon="triangle-alert">{err}</Banner></div>}
          {loading && !cv && <div className="shx-small" style={{ padding: "14px" }}>Loading parsed CV…</div>}
          {cv && GROUPS.map(([g, label]) => {
            if (g === "skills") {
              return skillsShown && (
                <div key={g} className="cvx-grp">
                  <button type="button" onClick={() => setClosed({ ...closed, [g]: !closed[g] })} aria-expanded={!closed[g]}><Icon name={closed[g] ? "chevron-right" : "chevron-down"} size={12} />{label} · {skills.length}</button>
                  {!closed[g] && (
                    <div className={`cvx-f${skills.length ? " is-ai" : ""}`}>
                      <span className="cvx-f__l">Skills</span>
                      <div className="cvx-f__v">
                        {editSkills !== null ? (
                          <input autoFocus value={editSkills} onChange={(e) => setEditSkills(e.target.value)} aria-label="Edit skills"
                            onKeyDown={(e) => {
                              if (e.key === "Escape") setEditSkills(null);
                              if (e.key === "Enter") { const list = editSkills.split(",").map((s) => s.trim()).filter(Boolean); setEditSkills(null); void save({ skills: list, change_summary: "Skills edited" }, true); }
                            }} />
                        ) : skills.length ? (
                          <div className="cvx-skills">{skills.map((s) => <span key={s} className="cvx-skill">{s}</span>)}</div>
                        ) : <span style={{ color: "var(--muted)" }}>Not found in CV</span>}
                        {editSkills !== null && <small>Comma-separated · Enter to save · Esc to cancel</small>}
                        <span><FieldChip st={skills.length ? (cv.sourceEvent === "manual_edit" && cv.diff.includes("skills") ? "edited" : "ai") : "missing"} /></span>
                      </div>
                      <span className="cvx-f__a">
                        {hr && editSkills === null && <button type="button" className="sh-iconbtn" disabled={busy} title="Edit skills" aria-label="Edit skills" onClick={() => setEditSkills(skills.join(", "))}><Icon name="pencil" size={16} /></button>}
                      </span>
                    </div>
                  )}
                </div>
              );
            }
            const rows = (fieldsByGroup[g] ?? []).map(withConfirm).filter(keep);
            if (!rows.length) return null;
            return (
              <div key={g} className="cvx-grp">
                <button type="button" onClick={() => setClosed({ ...closed, [g]: !closed[g] })} aria-expanded={!closed[g]}><Icon name={closed[g] ? "chevron-right" : "chevron-down"} size={12} />{label} · {rows.length}</button>
                {!closed[g] && rows.map((f) => (
                  <FieldRow key={f.id + f.st + f.v} f={f} hr={hr} busy={busy}
                    onConfirm={() => setConfirmed((m) => ({ ...m, [f.id]: { by: user.name, at: today() } }))}
                    onEdit={(val) => onEdit(f, val)} />
                ))}
              </div>
            );
          })}
          {!hr && <div className="shx-small" style={{ padding: "10px 14px" }}>Only HR can edit or confirm values read from the CV.</div>}
        </>
      )}
    </div>
  );

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setDrag(true);
    const box = root.current?.querySelector(".cvx-panes")?.getBoundingClientRect();
    if (!box) return;
    const mv = (ev: PointerEvent) => setRatio(Math.min(75, Math.max(30, ((ev.clientX - box.left) / box.width) * 100)));
    const up = () => {
      setDrag(false);
      removeEventListener("pointermove", mv);
      removeEventListener("pointerup", up);
      setRatio((r) => { lsSet("cvx-ratio", Math.round(r)); return r; });
    };
    addEventListener("pointermove", mv);
    addEventListener("pointerup", up);
  };

  return (
    <div className="cvx" ref={root}>
      <div className="cvx-bar">
        <select className="cvx-sel" value={verId ?? ""} disabled={!hist.length} aria-label="CV version"
          onChange={(e) => { const v = hist.find((x) => x.versionEventId === e.target.value); if (v) { setCmp(false); void load(v); } }}>
          {hist.length === 0 && <option value="">CV</option>}
          {hist.map((x) => <option key={x.versionEventId} value={x.versionEventId}>CV v{x.versionNumber} · {fmtDate(x.sortAt)}{x.kind === "active" ? " · used for scoring" : " · not used for scoring"}</option>)}
        </select>
        <Button size="sm" variant="ghost" icon="git-compare" disabled={!canCompare} title={hist.length < 2 ? "Only one CV version" : undefined} onClick={() => { setCmp(true); if (eff === "cv") setLayout(narrow ? "data" : "split"); }}>Compare versions</Button>
        <span className="ad-sp" />
        {user.key !== "iv" && <button type="button" className="sh-iconbtn" title="Download original file" aria-label="Download original file" onClick={() => window.open(cvFileUrl(caId, cur?.versionEventId), "_blank")}><Icon name="download" size={16} /></button>}
        <Tabs variant="segmented" value={eff} onChange={setLayout} tabs={[...(narrow ? [] : [{ id: "split", label: "Side by side" }]), { id: "cv", label: "Original CV" }, { id: "data", label: "Parsed data" }]} />
      </div>
      <div className="cvx-panes" style={{ gridTemplateColumns: eff === "split" ? `${ratio}% 1px minmax(0,1fr)` : "1fr" }}>
        {eff !== "data" && docPane}
        {eff === "split" && (
          <div className={`cvx-split${drag ? " is-drag" : ""}`} role="separator" aria-orientation="vertical" aria-label="Resize panes" tabIndex={0} onPointerDown={onDown}
            onKeyDown={(e) => { if (e.key === "ArrowLeft") setRatio((r) => Math.max(30, r - 5)); if (e.key === "ArrowRight") setRatio((r) => Math.min(75, r + 5)); }} />
        )}
        {eff !== "cv" && dataPane}
      </div>
    </div>
  );
}
