"use client";

import type { Key } from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Avatar,
  Button,
  Card,
  Chip,
  Drawer,
  Label,
  ListBox,
  Pagination,
  SearchField,
  Select,
  Separator,
  Table,
} from "@heroui/react";

import { AddCandidateModal } from "@/components/admin/candidates/add-candidate-modal";
import {
  type CandidateDbRow,
  candidateDbRowToTableRow,
} from "@/lib/candidates/db-row";
import { CANDIDATE_ROWS } from "@/lib/candidates/mock-data";
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
];

const CHAPTER_OPTIONS = [
  "Chapter: Global",
  "Engineering",
  "Design",
  "Marketing",
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? "";
  return `${a}${b}`.toUpperCase() || "?";
}

function jdMatchChipColor(
  row: CandidateRow,
): "success" | "accent" | "danger" | "default" {
  if (row.jdMatchScore == null) return "default";
  if (row.jdMatchScore >= 75) return "success";
  if (row.jdMatchScore >= 50) return "accent";
  return "danger";
}

function statusChipProps(
  status: CandidateStatus,
): { color: "success" | "accent" | "default" } {
  switch (status) {
    case "Interviewing":
      return { color: "success" };
    case "Shortlisted":
      return { color: "accent" };
    default:
      return { color: "default" };
  }
}

function pageWindow(current: number, total: number, width: number) {
  let start = Math.max(1, current - Math.floor(width / 2));
  const end = Math.min(total, start + width - 1);
  start = Math.max(1, end - width + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function SortIcon({ className }: { className?: string }) {
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
      <path d="M3 6h18M7 12h10M11 18h2" />
    </svg>
  );
}

export function CandidatePipelineDashboard({ initialRows }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [statusKey, setStatusKey] = useState<Key | null>("all");
  const [chapter, setChapter] = useState<Key | null>("Chapter: Global");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeRow, setActiveRow] = useState<CandidateRow | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
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

  const tableSourceRows = useMemo(() => {
    let rows: CandidateRow[];
    if (dbLoadState === "error") {
      rows = [...CANDIDATE_ROWS];
    } else if (dbLoadState !== "ok") {
      return [];
    } else {
      rows = dbRows.map(candidateDbRowToTableRow);
    }
    rows.sort((a, b) => {
      const as = a.jdMatchScore ?? -1;
      const bs = b.jdMatchScore ?? -1;
      if (bs !== as) return bs - as;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [dbLoadState, dbRows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tableSourceRows.filter((row) => {
      if (statusKey != null && statusKey !== "all" && row.status !== statusKey) {
        return false;
      }
      if (
        chapter != null &&
        chapter !== "Chapter: Global" &&
        row.chapter !== chapter
      ) {
        return false;
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
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [chapter, query, statusKey]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);

  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * ROWS_PER_PAGE;
    return filteredRows.slice(start, start + ROWS_PER_PAGE);
  }, [filteredRows, safePage]);

  const startIdx = filteredRows.length === 0 ? 0 : (safePage - 1) * ROWS_PER_PAGE + 1;
  const endIdx = Math.min(safePage * ROWS_PER_PAGE, filteredRows.length);

  function openRow(row: CandidateRow) {
    setActiveRow(row);
    setDrawerOpen(true);
  }

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

      <AddCandidateModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        onCandidatesChanged={fetchCandidates}
      />

      <Card variant="secondary" className="overflow-hidden">
        <Card.Content className="gap-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <SearchField
              value={query}
              onChange={setQuery}
              className="min-w-[280px] flex-1"
            >
              <SearchField.Group className="w-full">
                <SearchField.SearchIcon />
                <SearchField.Input
                  placeholder="Search by name, role, skill, source, or match…"
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
              value={chapter}
              onChange={(key) => {
                setChapter(key);
                setPage(1);
              }}
            >
              <Label className="sr-only">Chapter</Label>
              <Select.Trigger className="min-w-[180px]">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {CHAPTER_OPTIONS.map((opt) => (
                    <ListBox.Item key={opt} id={opt} textValue={opt}>
                      {opt}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>

            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              aria-label="Sort or filter"
            >
              <SortIcon className="size-5" />
            </Button>
          </div>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content className="gap-0 p-0">
          <Table>
            <Table.ScrollContainer>
              <Table.Content
                aria-label="Candidate pipeline"
                className="min-w-[1160px]"
              >
                <Table.Header>
                  <Table.Column isRowHeader>Candidate &amp; Role</Table.Column>
                  <Table.Column className="text-center">Exp.</Table.Column>
                  <Table.Column>Key Skills</Table.Column>
                  <Table.Column>Education</Table.Column>
                  <Table.Column>Source</Table.Column>
                  <Table.Column className="text-center">JD match</Table.Column>
                  <Table.Column>Status</Table.Column>
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
                              {initials(row.name)}
                            </Avatar.Fallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground">
                              {row.name}
                            </p>
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
                          color={statusChipProps(row.status).color}
                          className="text-[10px] font-bold uppercase"
                        >
                          {row.status}
                        </Chip>
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-w-0 font-bold text-accent"
                          onPress={() => openRow(row)}
                        >
                          View Detail
                        </Button>
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
                      <Avatar.Fallback>{initials(activeRow.name)}</Avatar.Fallback>
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
                    color={statusChipProps(activeRow.status).color}
                    className="mt-2 w-fit uppercase"
                  >
                    {activeRow.status}
                  </Chip>
                </Drawer.Header>
                <Drawer.Body className="flex flex-col gap-6">
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
                      Chapter
                    </h3>
                    <p className="mt-1 text-sm text-muted">{activeRow.chapter}</p>
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
                  <Button variant="primary">Move stage</Button>
                </Drawer.Footer>
              </>
            ) : null}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </div>
  );
}
