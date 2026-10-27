"use client";

import * as React from "react";
import Link from "next/link";
import { Badge, Banner } from "../position-management-2/ext";
import { Shell } from "../position-management-2/shell";
import type { Role } from "../position-management-2/data";

type Row = {
  jobId: string; title: string; status: string; flowVersion: number;
  candidates: number; convertedAt: string | null; convertedBy: string | null;
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

/** Read-only progress list. Conversion itself is per job, from the position's own page. */
export function MigrationApp({ embedded = false, viewer }: { embedded?: boolean; viewer: { name: string; role: string; canEdit: boolean } }) {
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!viewer.canEdit) return;
    fetch("/api/admin/migration/progress")
      .then(async (r) => (r.ok ? ((await r.json()) as { jobs: Row[] }).jobs : Promise.reject(new Error("Could not load progress."))))
      .then(setRows)
      .catch((e: Error) => setErr(e.message));
  }, [viewer.canEdit]);

  const user = { key: viewer.canEdit ? "hr" : "rc", name: viewer.name, role: viewer.role, salary: false, canCreate: viewer.canEdit, canDecide: false } as unknown as Role;
  const legacy = rows?.filter((r) => r.flowVersion < 2).length ?? 0;

  return (
    <Shell embedded={embedded} onHome={() => {}} user={user} active="jobs" crumbs={["Setup"]} title="Migration"
      subtitle="Progress of moving positions to the new structure.">
      {!viewer.canEdit ? (
        <Banner tone="warning" title="HR only">Only HR can view migration progress.</Banner>
      ) : err ? (
        <Banner tone="danger" title="Error">{err}</Banner>
      ) : !rows ? (
        <p>Loading…</p>
      ) : (
        <>
          <Banner tone="info" title={`${legacy} of ${rows.length} positions still use the old structure`}>
            Conversion is done one position at a time: open the position in Position Management and choose “Chuyển sang cấu trúc mới”. It cannot be undone.
          </Banner>
          <table style={{ width: "100%", marginTop: 16, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left" }}><th>Position</th><th>Status</th><th>Candidates</th><th>Structure</th><th>Converted</th><th>By</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.jobId}>
                  <td>{r.title}</td>
                  <td>{r.status}</td>
                  <td>{r.candidates}</td>
                  <td><Badge tone={r.flowVersion >= 2 ? "success" : "warning"}>{r.flowVersion >= 2 ? "Mới" : "Cấu trúc cũ"}</Badge></td>
                  <td>{fmt(r.convertedAt)}</td>
                  <td>{r.convertedBy ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: 12 }}><Link href="/admin/position-management-2">Open Position Management</Link></p>
        </>
      )}
    </Shell>
  );
}
