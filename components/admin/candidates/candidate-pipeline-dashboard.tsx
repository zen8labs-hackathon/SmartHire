"use client";

import type { Key } from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AlertDialog,
  Avatar,
  Button,
  Card,
  Chip,
  Drawer,
  Input,
  Label,
  ListBox,
  Pagination,
  SearchField,
  Select,
  Separator,
  Spinner,
  Table,
  Tooltip,
} from "@heroui/react";

import { AddCandidateModal } from "@/components/admin/candidates/add-candidate-modal";
import {
  candidateDisplayInitials,
  candidateStatusChipColor,
  jdMatchChipColor,
} from "@/lib/candidates/candidate-display";
import {
  type CandidateDbRow,
  candidateDbRowToTableRow,
} from "@/lib/candidates/db-row";
import { CANDIDATE_ROWS } from "@/lib/candidates/mock-data";
import { allowedTargetsFromStatus } from "@/lib/candidates/pipeline-allowed-transitions";
import type { CandidateRow, CandidateStatus } from "@/lib/candidates/types";
import { createClient } from "@/lib/supabase/client";

type Props = {
  initialRows?: CandidateDbRow[];
};

const ROWS_PER_PAGE = 4;

const STATUS_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "all", label: "Status: All" },
  { id: "New", label: "New" },
  { id: "Shortlisted", label: "Shortlisted" },
  { id: "Interviewing", label: "Interviewing" },
  { id: "Offer", label: "Offer" },
  { id: "Failed", label: "Failed" },
  { id: "Matched", label: "Matched" },
  { id: "Rejected", label: "Rejected" },
];

function pageWindow(current: number, total: number, width: number) {
  let start = Math.max(1, current - Math.floor(width / 2));
  const end = Math.min(total, start + width - 1);
  start = Math.max(1, end - width + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

/** Local calendar day YYYY-MM-DD for upload timestamp (for date filter). */
function uploadDateKeyLocal(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatUploadedAtDisplay(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function CandidatePipelineDashboard({ initialRows }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [statusKey, setStatusKey] = useState<Key | null>("all");
  const [jdFilterKey, setJdFilterKey] = useState<Key | null>("all");
  /** `YYYY-MM-DD` from `<input type="date" />`, or "" when not filtering */
  const [uploadDateFilter, setUploadDateFilter] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeRow, setActiveRow] = useState<CandidateRow | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [rowPendingDelete, setRowPendingDelete] = useState<CandidateRow | null>(
    null,
  );
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [statusUpdateBusy, setStatusUpdateBusy] = useState(false);
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(null);
  const [dbRows, setDbRows] = useState<CandidateDbRow[]>(initialRows ?? []);
  const [dbLoadState, setDbLoadState] = useState<"loading" | "error" | "ok">(
    initialRows ? "ok" : "loading",
  );

  // Fetch via server API route — bypasses browser Supabase session entirely,
  // uses cookie-based server auth which is always reliable.
  const fetchCandidates = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/candidates", { credentials: "include" });
      if (!res.ok) {
        setDbLoadState("error");
        return;
      }
      const json = (await res.json()) as { candidates?: CandidateDbRow[] };
      setDbRows(json.candidates ?? []);
      setDbLoadState("ok");
    } catch {
      setDbLoadState("error");
    }
  }, []);

  useEffect(() => {
    // Skip initial fetch if the page already provided server-side data.
    if (!initialRows) {
      void fetchCandidates();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("candidates-admin-table")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "candidates" },
        () => {
          void fetchCandidates();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, fetchCandidates]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [jdFilterKey]);

  useEffect(() => {
    setPage(1);
  }, [uploadDateFilter]);

  const tableSourceRows = useMemo(() => {
    if (dbLoadState === "error") {
      const rows = [...CANDIDATE_ROWS];
      rows.sort((a, b) => {
        const as = a.jdMatchScore ?? -1;
        const bs = b.jdMatchScore ?? -1;
        if (bs !== as) return bs - as;
        return a.name.localeCompare(b.name);
      });
      return rows;
    }
    if (dbLoadState !== "ok") {
      return [];
    }
    const sortedDb = [...dbRows].sort((a, b) => {
      const ta = new Date(a.cv_uploaded_at ?? a.created_at).getTime();
      const tb = new Date(b.cv_uploaded_at ?? b.created_at).getTime();
      return tb - ta;
    });
    return sortedDb.map(candidateDbRowToTableRow);
  }, [dbLoadState, dbRows]);

  const jdFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of tableSourceRows) {
      if (r.jobOpeningId) {
        map.set(r.jobOpeningId, r.jdCampaignLabel);
      }
    }
    const sorted = [...map.entries()].sort((a, b) =>
      a[1].localeCompare(b[1], undefined, { sensitivity: "base" }),
    );
    return [
      { id: "all", label: "JD: All" },
      { id: "unassigned", label: "Unassigned" },
      ...sorted.map(([id, label]) => ({ id, label })),
    ];
  }, [tableSourceRows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tableSourceRows.filter((row) => {
      if (statusKey != null && statusKey !== "all" && row.status !== statusKey) {
        return false;
      }
      if (jdFilterKey != null && jdFilterKey !== "all") {
        if (jdFilterKey === "unassigned") {
          if (row.jobOpeningId != null) return false;
        } else if (row.jobOpeningId !== String(jdFilterKey)) {
          return false;
        }
      }
      if (uploadDateFilter) {
        const key = uploadDateKeyLocal(row.cvUploadedAtIso);
        if (key !== uploadDateFilter) return false;
      }
      if (!q) return true;
      const hay = [
        row.name,
        row.role,
        ...row.skills,
        row.degree,
        row.school,
        row.sourceLabel,
        row.jdMatchLabel,
        row.jdCampaignLabel,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [jdFilterKey, query, statusKey, tableSourceRows, uploadDateFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);

  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * ROWS_PER_PAGE;
    return filteredRows.slice(start, start + ROWS_PER_PAGE);
  }, [filteredRows, safePage]);

  const startIdx = filteredRows.length === 0 ? 0 : (safePage - 1) * ROWS_PER_PAGE + 1;
  const endIdx = Math.min(safePage * ROWS_PER_PAGE, filteredRows.length);

  const noResultsForUploadDate =
    uploadDateFilter.length > 0 &&
    dbLoadState === "ok" &&
    filteredRows.length === 0 &&
    tableSourceRows.length > 0;

  function openRow(row: CandidateRow) {
    setStatusUpdateError(null);
    setActiveRow(row);
    setDrawerOpen(true);
  }

  const drawerStatusOptions = useMemo(() => {
    if (!activeRow) return [];
    return allowedTargetsFromStatus(activeRow.status);
  }, [activeRow]);

  const patchCandidateStatus = useCallback(
    async (next: CandidateStatus) => {
      if (!activeRow || next === activeRow.status) return;
      setStatusUpdateError(null);
      setStatusUpdateBusy(true);
      try {
        const res = await fetch(`/api/admin/candidates/${activeRow.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setStatusUpdateError(body.error ?? "Could not update status.");
          return;
        }
        const json = (await res.json()) as { candidate?: CandidateDbRow };
        const c = json.candidate;
        if (!c) {
          await fetchCandidates();
          return;
        }
        setDbRows((prev) => prev.map((r) => (r.id === c.id ? c : r)));
        setActiveRow((prev) =>
          prev?.id === c.id ? candidateDbRowToTableRow(c) : prev,
        );
      } catch {
        setStatusUpdateError("Could not update status.");
      } finally {
        setStatusUpdateBusy(false);
      }
    },
    [activeRow, fetchCandidates],
  );

  const confirmDeleteCandidate = useCallback(async () => {
    if (!rowPendingDelete) return;
    setDeleteError(null);
    setDeleteInProgress(true);
    try {
      const res = await fetch(
        `/api/admin/candidates/${rowPendingDelete.id}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setDeleteError(body.error ?? "Could not delete candidate.");
        return;
      }
      if (activeRow?.id === rowPendingDelete.id) {
        setDrawerOpen(false);
        setActiveRow(null);
      }
      setDeleteDialogOpen(false);
      setRowPendingDelete(null);
      await fetchCandidates();
    } catch {
      setDeleteError("Could not delete candidate.");
    } finally {
      setDeleteInProgress(false);
    }
  }, [activeRow?.id, fetchCandidates, rowPendingDelete]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            Smart Hire Suite
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Active Talent Pool
          </h1>
        </div>
        <Button
          variant="primary"
          className="bg-gradient-to-br from-[#002542] to-[#1b3b5a] shadow-sm"
          onPress={() => setAddModalOpen(true)}
        >
          <span className="text-lg leading-none">+</span>
          Add Candidate
        </Button>
      </div>

      {dbLoadState === "error" ? (
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
          Could not load candidates from the database. Showing sample data until
          the connection works.
        </p>
      ) : null}

      {deleteError ? (
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
          {deleteError}
        </p>
      ) : null}

      <AddCandidateModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        onCandidatesChanged={fetchCandidates}
      />

      <Card variant="secondary" className="overflow-hidden">
        <Card.Content className="gap-4 p-4">
          <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
              <SearchField
                value={query}
                onChange={setQuery}
                className="min-w-[280px] flex-1"
              >
                <SearchField.Group className="w-full">
                  <SearchField.SearchIcon />
                  <SearchField.Input
                    placeholder="Search by name, role, skill, source, JD, or match…"
                    className="w-full min-w-0"
                  />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>

              <Select
                value={statusKey}
                onChange={(key) => {
                  setStatusKey(key);
                  setPage(1);
                }}
              >
                <Label className="sr-only">Status</Label>
                <Select.Trigger className="min-w-[160px]">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {STATUS_OPTIONS.map((opt) => (
                      <ListBox.Item key={opt.id} id={opt.id} textValue={opt.label}>
                        {opt.label}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>

              <Select
                value={jdFilterKey}
                onChange={(key) => {
                  setJdFilterKey(key);
                  setPage(1);
                }}
              >
                <Label className="sr-only">Job description</Label>
                <Select.Trigger className="min-w-[200px]">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {jdFilterOptions.map((opt) => (
                      <ListBox.Item key={opt.id} id={opt.id} textValue={opt.label}>
                        {opt.label}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
              <CalendarIcon className="size-4 shrink-0 text-muted" />
              <Label
                htmlFor="cv-upload-date-filter"
                className="whitespace-nowrap text-xs font-medium text-muted"
              >
                Filter by date
              </Label>
              <Input
                id="cv-upload-date-filter"
                type="date"
                value={uploadDateFilter}
                onChange={(e) => setUploadDateFilter(e.target.value)}
                className="w-[11rem] min-w-0"
              />
              {uploadDateFilter ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-w-0 px-2 font-semibold text-muted"
                  aria-label="Clear date filter"
                  onPress={() => setUploadDateFilter("")}
                >
                  Clear
                </Button>
              ) : null}
            </div>
          </div>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content className="gap-0 p-0">
          <Table>
            <Table.ScrollContainer>
              <Table.Content
                aria-label="Candidate pipeline"
                className="min-w-[1400px]"
              >
                <Table.Header>
                  <Table.Column isRowHeader>Candidate &amp; Role</Table.Column>
                  <Table.Column className="text-center">Exp.</Table.Column>
                  <Table.Column>Key Skills</Table.Column>
                  <Table.Column>Education</Table.Column>
                  <Table.Column>Source</Table.Column>
                  <Table.Column>Applied JD</Table.Column>
                  <Table.Column className="text-center">JD match</Table.Column>
                  <Table.Column>Status</Table.Column>
                  <Table.Column className="whitespace-nowrap">
                    Uploaded at
                  </Table.Column>
                  <Table.Column className="text-right">Actions</Table.Column>
                </Table.Header>
                <Table.Body>
                  {dbLoadState === "loading" && tableSourceRows.length === 0 ? (
                    <Table.Row id="loading">
                      <Table.Cell>
                        <span className="text-sm text-muted">
                          Loading candidates…
                        </span>
                      </Table.Cell>
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                    </Table.Row>
                  ) : null}
                  {dbLoadState === "ok" &&
                  filteredRows.length === 0 &&
                  tableSourceRows.length === 0 ? (
                    <Table.Row id="empty">
                      <Table.Cell>
                        <span className="text-sm text-muted">
                          No candidates yet. Use Add Candidate to upload CVs.
                        </span>
                      </Table.Cell>
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                    </Table.Row>
                  ) : null}
                  {noResultsForUploadDate ? (
                    <Table.Row id="empty-upload-date">
                      <Table.Cell>
                        <span className="text-sm text-muted">
                          No results found for this date.
                        </span>
                      </Table.Cell>
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                    </Table.Row>
                  ) : null}
                  {paginatedRows.map((row) => (
                    <Table.Row key={row.id} id={row.id}>
                      <Table.Cell>
                        <div className="flex items-center gap-4">
                          <Avatar className="size-10 shrink-0" size="md">
                            {row.avatarUrl ? (
                              <Avatar.Image alt="" src={row.avatarUrl} />
                            ) : null}
                            <Avatar.Fallback className="text-xs">
                              {candidateDisplayInitials(row.name)}
                            </Avatar.Fallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <p className="font-semibold text-foreground">
                                {row.name}
                              </p>
                              {row.hasCvFile ? (
                                <a
                                  href={`/api/admin/candidates/${row.id}/cv-download`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-semibold text-accent underline-offset-2 hover:underline"
                                >
                                  CV file
                                </a>
                              ) : null}
                            </div>
                            <p className="text-xs font-medium text-muted">
                              {row.role}
                            </p>
                          </div>
                        </div>
                      </Table.Cell>
                      <Table.Cell className="text-center align-middle">
                        <div className="flex flex-col items-center tabular-nums">
                          <span className="text-lg font-semibold leading-none text-foreground">
                            {row.experienceYears}
                          </span>
                          <span className="text-[10px] font-medium text-muted">
                            Years
                          </span>
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex flex-wrap gap-1.5">
                          {row.skills.map((s) => (
                            <Chip
                              key={s}
                              size="sm"
                              variant="soft"
                              color="accent"
                              className="text-[10px] font-bold"
                            >
                              {s}
                            </Chip>
                          ))}
                          {row.moreSkills ? (
                            <Chip
                              size="sm"
                              variant="soft"
                              color="accent"
                              className="text-[10px] font-bold"
                            >
                              +{row.moreSkills}
                            </Chip>
                          ) : null}
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <p className="text-sm font-medium text-foreground">
                          {row.degree}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-tight text-muted">
                          {row.school}
                        </p>
                      </Table.Cell>
                      <Table.Cell>
                        <p className="max-w-[200px] text-sm text-foreground">
                          {row.sourceLabel}
                        </p>
                      </Table.Cell>
                      <Table.Cell>
                        <p className="max-w-[220px] truncate text-sm text-foreground" title={row.jdCampaignLabel}>
                          {row.jdCampaignLabel}
                        </p>
                      </Table.Cell>
                      <Table.Cell className="text-center align-middle">
                        <Chip
                          size="sm"
                          variant="soft"
                          color={jdMatchChipColor(row)}
                          className="min-w-[3.25rem] justify-center text-xs font-bold tabular-nums"
                        >
                          {row.jdMatchLabel}
                        </Chip>
                      </Table.Cell>
                      <Table.Cell>
                        <Chip
                          size="sm"
                          variant="soft"
                          color={candidateStatusChipColor(row.status)}
                          className="text-[10px] font-bold uppercase"
                        >
                          {row.status}
                        </Chip>
                      </Table.Cell>
                      <Table.Cell className="whitespace-nowrap text-sm text-foreground">
                        {formatUploadedAtDisplay(row.cvUploadedAtIso)}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip delay={0}>
                            <Button
                              isIconOnly
                              variant="ghost"
                              size="sm"
                              className="text-accent"
                              aria-label="View details"
                              onPress={() => openRow(row)}
                            >
                              <EyeIcon className="size-5" />
                            </Button>
                            <Tooltip.Content placement="top" showArrow>
                              <Tooltip.Arrow />
                              <p>View details</p>
                            </Tooltip.Content>
                          </Tooltip>
                          <Tooltip delay={0}>
                            <Button
                              isIconOnly
                              variant="ghost"
                              size="sm"
                              className="text-rose-600 dark:text-rose-400"
                              aria-label="Delete CV"
                              onPress={() => {
                                setDeleteError(null);
                                setRowPendingDelete(row);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <TrashIcon className="size-5" />
                            </Button>
                            <Tooltip.Content placement="top" showArrow>
                              <Tooltip.Arrow />
                              <p>Delete CV</p>
                            </Tooltip.Content>
                          </Tooltip>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
            <Table.Footer className="border-t border-divider px-4 py-3">
              <Pagination size="sm">
                <Pagination.Summary>
                  Showing {filteredRows.length === 0 ? 0 : startIdx} to {endIdx}{" "}
                  of {filteredRows.length} candidates
                </Pagination.Summary>
                <Pagination.Content>
                  <Pagination.Item>
                    <Pagination.Previous
                      isDisabled={safePage <= 1}
                      onPress={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <Pagination.PreviousIcon />
                    </Pagination.Previous>
                  </Pagination.Item>
                  {pageWindow(safePage, totalPages, 3).map((p) => (
                      <Pagination.Item key={p}>
                        <Pagination.Link
                          isActive={p === safePage}
                          onPress={() => setPage(p)}
                        >
                          {p}
                        </Pagination.Link>
                      </Pagination.Item>
                    ))}
                  <Pagination.Item>
                    <Pagination.Next
                      isDisabled={safePage >= totalPages}
                      onPress={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                    >
                      <Pagination.NextIcon />
                    </Pagination.Next>
                  </Pagination.Item>
                </Pagination.Content>
              </Pagination>
            </Table.Footer>
          </Table>
        </Card.Content>
      </Card>

      <Drawer.Backdrop isOpen={drawerOpen} onOpenChange={setDrawerOpen}>
        <Drawer.Content placement="right">
          <Drawer.Dialog className="w-full max-w-md sm:max-w-lg">
            <Drawer.CloseTrigger />
            {activeRow ? (
              <>
                <Drawer.Header>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-12" size="lg">
                      {activeRow.avatarUrl ? (
                        <Avatar.Image alt="" src={activeRow.avatarUrl} />
                      ) : null}
                      <Avatar.Fallback>
                        {candidateDisplayInitials(activeRow.name)}
                      </Avatar.Fallback>
                    </Avatar>
                    <div className="min-w-0">
                      <Drawer.Heading className="truncate">
                        {activeRow.name}
                      </Drawer.Heading>
                      <p className="text-sm text-muted">{activeRow.role}</p>
                    </div>
                  </div>
                  <Chip
                    size="sm"
                    variant="soft"
                    color={candidateStatusChipColor(activeRow.status)}
                    className="mt-2 w-fit uppercase"
                  >
                    {activeRow.status}
                  </Chip>
                </Drawer.Header>
                <Drawer.Body className="flex flex-col gap-6">
                  <section>
                    <h3 className="text-sm font-semibold text-foreground">
                      Status
                    </h3>
                    <div className="mt-2 max-w-xs">
                      <Select
                        value={activeRow.status}
                        isDisabled={
                          statusUpdateBusy || dbLoadState === "error"
                        }
                        onChange={(key) => {
                          if (key == null || typeof key !== "string") return;
                          void patchCandidateStatus(key as CandidateStatus);
                        }}
                      >
                        <Label className="sr-only">Pipeline status</Label>
                        <Select.Trigger className="w-full">
                          <Select.Value />
                          <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                          <ListBox>
                            {drawerStatusOptions.map((s) => (
                              <ListBox.Item
                                key={s}
                                id={s}
                                textValue={s}
                              >
                                {s}
                                <ListBox.ItemIndicator />
                              </ListBox.Item>
                            ))}
                          </ListBox>
                        </Select.Popover>
                      </Select>
                      {statusUpdateBusy ? (
                        <p className="mt-1.5 text-xs text-muted">Updating…</p>
                      ) : null}
                      {statusUpdateError ? (
                        <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">
                          {statusUpdateError}
                        </p>
                      ) : null}
                    </div>
                  </section>
                  <Separator />
                  <section>
                    <h3 className="text-sm font-semibold text-foreground">
                      Experience
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      {activeRow.experienceYears} years
                    </p>
                  </section>
                  <Separator />
                  <section>
                    <h3 className="text-sm font-semibold text-foreground">
                      Key skills
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {activeRow.skills.map((s) => (
                        <Chip key={s} size="sm" variant="soft" color="accent">
                          {s}
                        </Chip>
                      ))}
                      {activeRow.moreSkills ? (
                        <Chip size="sm" variant="soft" color="accent">
                          +{activeRow.moreSkills} more
                        </Chip>
                      ) : null}
                    </div>
                  </section>
                  <Separator />
                  <section>
                    <h3 className="text-sm font-semibold text-foreground">
                      Education
                    </h3>
                    <p className="mt-1 text-sm text-foreground">
                      {activeRow.degree}
                    </p>
                    <p className="text-xs font-bold uppercase text-muted">
                      {activeRow.school}
                    </p>
                  </section>
                  <Separator />
                  <section>
                    <h3 className="text-sm font-semibold text-foreground">
                      Applied JD
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      {activeRow.jdCampaignLabel}
                    </p>
                  </section>
                  <Separator />
                  <section>
                    <h3 className="text-sm font-semibold text-foreground">
                      Sourced from
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      {activeRow.sourceLabel}
                    </p>
                  </section>
                  <Separator />
                  <section>
                    <h3 className="text-sm font-semibold text-foreground">
                      JD match (AI)
                    </h3>
                    <div className="mt-2 flex items-center gap-2">
                      <Chip
                        size="sm"
                        variant="soft"
                        color={jdMatchChipColor(activeRow)}
                        className="text-sm font-bold tabular-nums"
                      >
                        {activeRow.jdMatchLabel}
                      </Chip>
                      {activeRow.jdMatchScore != null ? (
                        <span className="text-xs text-muted">/ 100</span>
                      ) : null}
                    </div>
                    {activeRow.jdMatchError ? (
                      <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">
                        {activeRow.jdMatchError}
                      </p>
                    ) : activeRow.jdMatchRationale ? (
                      <p className="mt-2 text-sm leading-relaxed text-muted">
                        {activeRow.jdMatchRationale}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-muted">
                        No rationale yet. Match runs after the CV is parsed and a
                        job description is available for the campaign.
                      </p>
                    )}
                  </section>
                </Drawer.Body>
                <Drawer.Footer className="flex flex-wrap gap-2">
                  <Button slot="close" variant="secondary">
                    Close
                  </Button>
                </Drawer.Footer>
              </>
            ) : null}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>

      <AlertDialog.Backdrop
        isOpen={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            setRowPendingDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[400px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Delete CV candidate?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="text-sm text-muted">
                This will permanently remove{" "}
                <strong className="text-foreground">
                  {rowPendingDelete?.name ?? "this candidate"}
                </strong>{" "}
                and the stored CV file. This cannot be undone.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary" isDisabled={deleteInProgress}>
                Cancel
              </Button>
              <Button
                variant="danger"
                isPending={deleteInProgress}
                onPress={() => void confirmDeleteCandidate()}
              >
                {({ isPending }) => (
                  <>
                    {isPending ? (
                      <Spinner color="current" size="sm" className="mr-1.5" />
                    ) : null}
                    Delete
                  </>
                )}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  );
}
