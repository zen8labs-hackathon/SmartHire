"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import {
  AsyncStatusChip,
  Banner,
  BoardCard,
  BulkActionBar,
  Button,
  ConditionChips,
  ConfirmDialog,
  DataTable,
  type DataTableColumn,
  type SortState,
  EmptyState,
  ErrorState,
  FilterPopover,
  IconButton,
  AiLabel,
  FitSignal,
  RestrictedValue,
} from "@/components/ui";
import { ToastProvider, useToast } from "@/components/admin/toast-provider";
import { OpenPositionDialog } from "@/components/positions/open-position-dialog";
import { Plus, Trash2 } from "lucide-react";

const STAGES = [
  { id: "new", label: "New" },
  { id: "screen", label: "Screening" },
  { id: "interview", label: "Interview" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-divider py-6">
      <h2 className="text-section font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Demo() {
  const { undoable } = useToast();
  const [confirm, setConfirm] = useState(false);
  const [openPos, setOpenPos] = useState(false);
  const [sel, setSel] = useState<string[]>(["open"]);
  const [stage, setStage] = useState("new");
  const [rows, setRows] = useState(2);
  const [tSel, setTSel] = useState<ReadonlySet<string>>(new Set());
  const [tSort, setTSort] = useState<SortState>(null);
  const [tPage, setTPage] = useState(1);
  const tData = Array.from({ length: 23 }, (_, i) => ({ id: `p${i + 1}`, name: `Position ${i + 1}`, dept: i % 2 ? "Design" : "Engineering" }));
  const tCols: DataTableColumn<(typeof tData)[number]>[] = [
    { key: "name", header: "Position", cell: (r) => r.name, rowHeader: true, sortable: true },
    { key: "dept", header: "Department", cell: (r) => r.dept, width: "180px" },
  ];
  const tRows = [...tData]
    .sort((a, b) => (tSort ? a.name.localeCompare(b.name, undefined, { numeric: true }) * (tSort.direction === "asc" ? 1 : -1) : 0))
    .slice((tPage - 1) * 5, tPage * 5);

  return (
    <div className="mx-auto max-w-[880px] p-6">
      <h1 className="text-page font-bold">Component library (F0.3)</h1>
      <p className="text-muted">Every Epic 1–8 screen builds from these. Do not re-create them per feature.</p>

      <Section title="Button / IconButton">
        <div className="flex gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger" icon={Trash2}>Delete</Button>
          <Button loading>Saving</Button>
          <IconButton label="Add" icon={Plus} outline />
        </div>
      </Section>

      <Section title="Banner">
        <Banner tone="info" title="Heads up">Informational message.</Banner>
        <Banner tone="danger" title="Could not save">Check your connection and retry.</Banner>
      </Section>

      <Section title="Empty / error state">
        <EmptyState title="No positions yet" description="Create your first position to start hiring." action={<Button icon={Plus}>New position</Button>} />
        <ErrorState title="Could not load candidates" description="The server did not respond." action={<Button variant="secondary">Retry</Button>} />
      </Section>

      <Section title="Async status chip">
        <div className="flex flex-wrap gap-2">
          <AsyncStatusChip kind="upload" state="running" />
          <AsyncStatusChip kind="extraction" state="failed" reason="file is password-protected" />
          <AsyncStatusChip kind="scoring" state="done" />
          <AsyncStatusChip kind="pdf" state="queued" />
        </div>
      </Section>

      <Section title="Filter popover, condition chips, bulk bar">
        <div className="flex items-center gap-2">
          <FilterPopover
            label="Status"
            selected={sel}
            onChange={setSel}
            options={[{ value: "open", label: "Open", count: 12 }, { value: "closed", label: "Closed", count: 4 }]}
          />
          <ConditionChips
            conditions={sel.map((s) => ({ key: s, label: `Status: ${s}` }))}
            onRemove={(k) => setSel(sel.filter((s) => s !== k))}
            onClearAll={() => setSel([])}
          />
        </div>
        <BulkActionBar count={rows} onClear={() => setRows(0)}>
          <Button size="sm" variant="secondary">Archive</Button>
        </BulkActionBar>
      </Section>

      <Section title="DataTable (replaces table-system.tsx)">
        <DataTable
          caption="Demo positions"
          columns={tCols}
          rows={tRows}
          getRowId={(r) => r.id}
          selectable
          selectedIds={tSel}
          onSelectionChange={setTSel}
          bulkActions={<Button variant="danger-ghost" size="sm" icon={Trash2}>Delete</Button>}
          sort={tSort}
          onSortChange={setTSort}
          pagination={{ page: tPage, pageSize: 5, total: tData.length, onPageChange: setTPage }}
        />
      </Section>

      <Section title="AI label, restricted value, fit signal (F0.4)">
        <div className="flex flex-wrap items-center gap-4">
          <AiLabel provenance={{ model: "claude-sonnet-5-5", generatedAt: "2026-10-08T03:00:00Z", source: { kind: "jd", page: 2 }, state: "unconfirmed" }} />
          <AiLabel provenance={{ model: "claude-sonnet-5-5", generatedAt: "2026-10-08T03:00:00Z", source: { kind: "cv", quote: "5 years of Go" }, state: "edited" }} />
          <RestrictedValue value={{ restricted: true, reason: "Salary is visible to HR and the Chapter Head only" }}>{(v: string) => v}</RestrictedValue>
          <FitSignal score={82} />
          <FitSignal score={30} />
          <FitSignal score={null} />
        </div>
      </Section>

      <Section title="Board card (press M when focused)">
        <div className="w-[260px]">
          <BoardCard title="Nguyen A" subtitle={`Backend · ${stage}`} stageId={stage} stages={STAGES} onMove={setStage} />
        </div>
      </Section>

      <Section title="Open position dialog (F1.1)">
        <div>
          <Button icon={Plus} onClick={() => setOpenPos(true)}>New position</Button>
        </div>
        <OpenPositionDialog open={openPos} onClose={() => setOpenPos(false)} onCreated={() => setOpenPos(false)} />
      </Section>

      <Section title="Confirm dialog and Undo toast">
        <div className="flex gap-2">
          <Button variant="danger" onClick={() => setConfirm(true)}>Delete position</Button>
          <Button variant="secondary" onClick={() => undoable("Position archived", () => {})}>Archive with Undo</Button>
        </div>
        <ConfirmDialog
          open={confirm}
          title="Delete this position?"
          consequence="3 candidates will be unlinked. This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={() => setConfirm(false)}
          onCancel={() => setConfirm(false)}
        />
      </Section>
    </div>
  );
}

export default function ComponentsDocsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <ToastProvider>
      <Demo />
    </ToastProvider>
  );
}
