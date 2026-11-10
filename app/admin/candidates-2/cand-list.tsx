
"use client";

import * as React from "react";
import { Badge, Banner, Button, IdentityTag, Icon, Input, Select, Table, Tabs } from "../position-management-2/ext";
import { remindDue, retainDays, type CandApp, type Persona, type Person } from "./data";
import { fetchCandidates, setCandidateStar, type CandidateListQuery, type LoadedCandidates } from "./api";
import { Star } from "lucide-react";

export function ResultBadge({ a }: { a: CandApp }) {
  if (a.result === "official") return <IdentityTag kind="official" />;
  if (a.result === "probation") return <Badge tone="success" icon="user-check">On probation</Badge>;
  if (a.result === "hired") return <IdentityTag kind="hired" />;
  if (a.result === "pool") return <IdentityTag kind="pool" />;
  if (a.result === "ended") return <Badge tone="neutral" icon="circle-slash">Ended</Badge>;
  return <Badge tone="info" icon="circle-dot">Applying</Badge>;
}

export function stageText(a: any) {
  return a.result === "pool" ? a.from || "In talent pool" : a.stage + " - " + a.sub;
}

export function personTags(p: Person, user: Persona) {
  const u = user as any;
  const t: React.ReactNode[] = [];
  if (p.alumni) t.push(<IdentityTag key="al" kind="alumni" />);
  if (p.apps.some((a) => a.result === "probation")) t.push(<Badge key="pr" tone="success" icon="user-check">On probation</Badge>);
  else if (p.apps.some((a) => a.result === "official" || a.result === "hired") && !p.alumni) t.push(<IdentityTag key="h" kind="official" />);
  if (u.key !== "iv" && remindDue(p)) t.push(<Badge key="rc" tone="warning" icon="bell-ring">Re-contact due</Badge>);
  if (u.allJobs && retainDays(p) < 0) t.push(<Badge key="rt" tone="warning" icon="shield-alert">Retention ended</Badge>);
  if (p.dupOf && u.allJobs) t.push(<Badge key="d" tone="warning" icon="users">Possible duplicate</Badge>);
  return t;
}

const PAGE = 50;
const EXP: Record<string, Pick<CandidateListQuery, "expMin" | "expMax">> = {
  "0–2 years": { expMin: 0, expMax: 2 },
  "3–5 years": { expMin: 3, expMax: 5 },
  "6+ years": { expMin: 6 },
};
const REHIRE_Q: Record<string, NonNullable<CandidateListQuery["rehire"]>> = {
  "Eligible": "eligible", "Ask HR first": "ask", "Not eligible": "not_eligible", "Not set": "unset",
};
const SORTS: Record<string, Pick<CandidateListQuery, "sortBy" | "sortDir">> = {
  "Last updated": { sortBy: "updated", sortDir: "desc" },
  "Newest first": { sortBy: "created", sortDir: "desc" },
  "Name A–Z": { sortBy: "name", sortDir: "asc" },
  "Most experience": { sortBy: "exp", sortDir: "desc" },
};
const BAND_TONE: Record<string, string> = { "Strong fit": "success", "Good fit": "info", "Partial fit": "warning", "Weak fit": "neutral" };

export function ScoreBadge({ a }: { a: CandApp }) {
  if (a.scoring) return <Badge tone="neutral" icon="loader">Scoring…</Badge>;
  if (a.scoreErr) return <Badge tone="warning" icon="triangle-alert">Score failed</Badge>;
  if (a.score == null) return null;
  return <Badge tone={BAND_TONE[a.band || ""] || "neutral"}>{a.score} · {a.band}</Badge>;
}

export function CandidatesList({ user, open, onLoaded, onAdd, onExport, onBulk, compact }: {
  user: Persona; open: (id: number) => void;
  onLoaded: (r: LoadedCandidates) => void;
  onAdd: (ids: number[], done: () => void) => void; onExport: (n: number) => void;
  onBulk: (k: string, ids: number[], done: () => void) => void; compact?: boolean;
}) {
  const u = user as any;
  const [seg, setSeg] = React.useState("all");
  const [tag, setTag] = React.useState("Any tag");
  const [rhf, setRhf] = React.useState("Any rehire status");
  const [q, setQ] = React.useState("");
  const [dq, setDq] = React.useState("");
  const [starredOnly, setStarredOnly] = React.useState(false);
  const [savingStar, setSavingStar] = React.useState<string | null>(null);
  const [exp, setExp] = React.useState("Any experience");
  const [role, setRole] = React.useState("All roles");
  const [napp, setNapp] = React.useState("Any applications");
  const [sort, setSort] = React.useState("Last updated");
  const [page, setPage] = React.useState(0);
  const [sel, setSel] = React.useState<any[]>([]);
  const [data, setData] = React.useState<LoadedCandidates | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [retry, setRetry] = React.useState(0);
  const onLoadedRef = React.useRef(onLoaded);
  React.useEffect(() => {
    onLoadedRef.current = onLoaded;
  });

  React.useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Any filter change returns to the first page and drops the selection (row ids are page-relative).
  React.useEffect(() => { setPage(0); setSel([]); }, [seg, dq, role, exp, napp, tag, rhf, sort, starredOnly]);

  React.useEffect(() => {
    const ctl = new AbortController();
    setLoading(true); setError(null);
    const query: CandidateListQuery = {
      q: dq || undefined,
      tab: seg === "applying" ? "applying" : "all",
      role: role !== "All roles" ? role : undefined,
      starred: starredOnly ? true : undefined,
      tag: tag !== "Any tag" ? tag : undefined,
      rehire: REHIRE_Q[rhf],
      apps: napp === "1 application" ? "1" : napp === "2+ applications" ? "2+" : undefined,
      ...EXP[exp], ...SORTS[sort],
      limit: PAGE, offset: page * PAGE,
    };
    fetchCandidates(query, ctl.signal)
      .then((r) => { setData(r); setSel([]); onLoadedRef.current(r); setLoading(false); })
      .catch((e) => { if (ctl.signal.aborted) return; setError(e instanceof Error ? e.message : "Could not load candidates."); setLoading(false); });
    return () => ctl.abort();
  }, [seg, dq, role, exp, napp, tag, rhf, sort, page, retry, starredOnly]);

  const rows = data?.people ?? [];
  const total = data?.total ?? 0;
  const roles = ["All roles", ...(data?.facets.roles ?? [])];
  const allTags = data?.facets.tags ?? [];
  const segs = [
    { id: "all", label: "All", count: data?.counts.all },
    { id: "applying", label: "Applying", count: data?.counts.applying },
  ];
  const canAct = u.key !== "iv";
  const filtered =
    starredOnly ||
    !!dq ||
    role !== "All roles" ||
    exp !== "Any experience" ||
    napp !== "Any applications" ||
    tag !== "Any tag" ||
    rhf !== "Any rehire status" ||
    seg !== "all";
  const toggleStar = async (p: Person) => {
    const uuid = data?.uuidById.get(p.id);

    if (!uuid || savingStar !== null) return;

    setSavingStar(uuid);
    setError(null);

    try {
      const starred = await setCandidateStar(uuid, !p.isStarred);

      setData((current) => {
        if (!current) return current;

        return {
          ...current,
          people: current.people.map((person) => current.uuidById.get(person.id) === uuid ? { ...person, isStarred: starred } : person),
        };
      });
      if (starredOnly) { setRetry((value) => value + 1);}
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save star for candidate."
      );
    } finally {
      setSavingStar(null);
    }
  }

  const cols: any[] = [
    {
      key: "star",
      label: "Star",
      align: "center",
      render: (p: Person) => {
        const label = p.isStarred
          ? `Unstar ${p.name}`
          : `Star ${p.name}`;

        return (
          <button
            type="button"
            aria-label={label}
            aria-pressed={!!p.isStarred}
            title={label}
            disabled={savingStar !== null}
            onClick={(e) => {
              e.stopPropagation();
              void toggleStar(p);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              padding: 0,
              border: 0,
              borderRadius: 6,
              background: "transparent",
              color: p.isStarred ? "#B7791F" : "var(--muted)",
              cursor: savingStar !== null ? "wait" : "pointer",
              opacity: savingStar !== null ? 0.6 : 1,
            }}
          >
            <Star
              size={18}
              fill={p.isStarred ? "currentColor" : "none"}
              aria-hidden="true"
            />
          </button>
        );
      },
    },
    { key: "name", label: "Candidate", render: (p: Person) => (
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 200 }}>
        <span className="shx-row" style={{ gap: 6, flexWrap: "wrap" }}><span style={{ fontWeight: 600, color: "var(--foreground)" }}>{p.name}</span>{personTags(p, user)}</span>
        <span className="shx-small">{p.email} · <span className="sh-num">{p.phone}</span></span>
      </div>) },
    { key: "role", label: "Role", render: (p: Person) => <span>{p.role}</span> },

    { key: "skills", label: "Skills", render: (p: Person) => (
      <span className="jb-chips" style={{ maxWidth: 240 }}>
        {p.skills.slice(0, 3).map((s) => <Badge key={s} tone="outline">{s}</Badge>)}
        {p.skills.length > 3 && <span className="shx-small" style={{ alignSelf: "center" }}>+{p.skills.length - 3}</span>}
      </span>) },
    { key: "apps", label: "Applications", align: "center", render: (p: Person) => <span className="sh-num">{p.appCount ?? p.apps.length}</span> },
    { key: "latest", label: "Latest application", render: (p: Person) => {
      const a = p.apps[0];
      if (!a) return <span className="shx-small">No applications yet</span>;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontWeight: 500 }}>{a.title}</span>
          <span className="shx-row" style={{ gap: 6, flexWrap: "wrap" }}>
            <ResultBadge a={a} /><span className="shx-small">{stageText(a)}</span><ScoreBadge a={a} />
          </span>
        </div>);
    } },

  //   { key: "updated", label: "Updated", render: (p: Person) => <span className="sh-num" style={{ color: "var(--fg-2)" }}>{p.updated}</span> },
  ];

  const from = total ? page * PAGE + 1 : 0;
  const to = page * PAGE + rows.length;

  return (
    <div style={{ padding: "0 0 32px", display: "flex", flexDirection: "column", gap: 12 }}>
      <Tabs value={seg} onChange={(v: string) => setSeg(v)} tabs={segs} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Input icon="search" size="sm" placeholder="Name, email, phone, skill or tag" value={q} onChange={(e: any) => setQ(e.target.value)} style={{ width: 280 }} />
        <Select size="sm" value={role} onChange={(e: any) => setRole(e.target.value)} options={roles} style={{ width: 200 }} />
        <Select size="sm" value={exp} onChange={(e: any) => setExp(e.target.value)} options={["Any experience", "0–2 years", "3–5 years", "6+ years"]} style={{ width: 160 }} />
        <Select size="sm" value={napp} onChange={(e: any) => setNapp(e.target.value)} options={["Any applications", "1 application", "2+ applications"]} style={{ width: 170 }} />
        {/* <Select size="sm" value={tag} onChange={(e: any) => setTag(e.target.value)} options={["Any tag", ...allTags]} style={{ width: 170 }} /> */}
        <Select size="sm" value={rhf} onChange={(e: any) => setRhf(e.target.value)} options={["Any rehire status", "Eligible", "Ask HR first", "Not eligible", "Not set"]} style={{ width: 180 }} />
        <span style={{ flex: 1 }} />
        <Select size="sm" value={sort} onChange={(e: any) => setSort(e.target.value)} options={Object.keys(SORTS)} style={{ width: 160 }} />
        <Select size="sm" value={starredOnly ? "Starred only" : "All candidates"} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setStarredOnly(e.target.value === "Starred only");}}options={["All candidates", "Starred only"]}style={{ width: 160 }}/>
      </div>
      {u.admin && <Banner tone="warning" icon="shield" title="Admin access">You can see every candidate regardless of position access. Each profile you open is recorded in the audit log.</Banner>}
      {error && (
        <Banner tone="warning" icon="triangle-alert" title="Could not load candidates">
          {error} <Button size="sm" variant="secondary" onClick={() => setRetry((n) => n + 1)}>Try again</Button>
        </Banner>
      )}
      {!data && loading ? (
        <div className="jb-empty"><Icon name="loader" size={20} /><b>Loading candidates…</b></div>
      ) : rows.length ? (
        <div style={{ opacity: loading ? 0.6 : 1, transition: "opacity .15s" }}>
          <Table columns={cols} rows={rows} compact={compact} selectable={canAct} selected={sel} onSelect={setSel} onRowClick={(p: Person) => open(p.id)} />
        </div>
      ) : !error ? (
        <div className="jb-empty">
          <Icon name="search-x" size={20} /><b>{filtered ? "No candidates match" + (dq ? " “" + dq + "”" : " these filters") : "No candidates yet"}</b>
          {filtered && <span className="shx-small">Search covers name, email, phone, role, skills and tags, and ignores diacritics. Try fewer words or clear filters.</span>}
          {filtered && <Button size="sm" variant="secondary" onClick={() => { setQ(""); setExp("Any experience"); setRole("All roles"); setNapp("Any applications"); setTag("Any tag"); setRhf("Any rehire status"); setStarredOnly(false);setSeg("all"); }}>Clear filters</Button>}
        </div>
      ) : null}
      {total > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="shx-small">{from}–{to} of {total}</span>
          <span style={{ flex: 1 }} />
          <Button size="sm" variant="secondary" disabled={page === 0 || loading} onClick={() => setPage((n) => n - 1)}>Previous</Button>
          <Button size="sm" variant="secondary" disabled={to >= total || loading} onClick={() => setPage((n) => n + 1)}>Next</Button>
        </div>
      )}
      {sel.length > 0 && (
        <div className="jb-bulkbar" role="region" aria-label="Bulk actions">
          <b style={{ fontWeight: 600 }}>{sel.length} selected</b>
          <span className="shx-small">{sel.filter((id) => rows.find((p) => p.id === id)?.apps.some((a) => a.result === "open")).length} already applying somewhere</span>
          <span style={{ flex: 1 }} />
          <Button size="sm" variant="ghost" onClick={() => setSel([])}>Clear</Button>
          <Button size="sm" variant="secondary" icon="tag" onClick={() => onBulk("tag", sel, () => setSel([]))}>Add tag…</Button>
          <Button size="sm" variant="secondary" icon="bell-plus" onClick={() => onBulk("rem", sel, () => setSel([]))}>Set reminder…</Button>
          <Button size="sm" variant="secondary" icon="download" onClick={() => onExport(sel.length)}>Export list</Button>
          <Button size="sm" icon="briefcase" onClick={() => onAdd(sel, () => setSel([]))}>Add to position…</Button>
        </div>
      )}
    </div>
  );
}
