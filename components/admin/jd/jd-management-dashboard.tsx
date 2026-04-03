"use client";

import { useMemo, useState } from "react";

import {
  Avatar,
  Button,
  Card,
  Chip,
  Drawer,
  Pagination,
  Separator,
  Table,
} from "@heroui/react";

import { getJdDetail, JD_KPIS, JD_ROWS, JD_VERSION_CHIPS } from "@/lib/jd/mock-data";
import type { JdRow, JdStatus } from "@/lib/jd/types";

const ROWS_PER_PAGE = 4;

function statusChipColor(
  status: JdStatus,
): "success" | "warning" | "default" {
  switch (status) {
    case "Active":
      return "success";
    case "Draft":
      return "warning";
    default:
      return "default";
  }
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
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

export function JdManagementDashboard() {
  const [page, setPage] = useState(1);
  const [titleFilter, setTitleFilter] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeRow, setActiveRow] = useState<JdRow | null>(null);

  const filteredRows = useMemo(() => {
    if (!titleFilter) return JD_ROWS;
    return JD_ROWS.filter((r) => r.jobTitle === titleFilter);
  }, [titleFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);

  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * ROWS_PER_PAGE;
    return filteredRows.slice(start, start + ROWS_PER_PAGE);
  }, [filteredRows, safePage]);

  const startIdx = (safePage - 1) * ROWS_PER_PAGE + 1;
  const endIdx = Math.min(safePage * ROWS_PER_PAGE, filteredRows.length);

  const detail = activeRow ? getJdDetail(activeRow) : null;

  function openRow(row: JdRow) {
    setActiveRow(row);
    setDrawerOpen(true);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Job descriptions
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Manage and monitor high-impact recruitment assets across campaigns.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary">View templates</Button>
          <Button variant="primary">New definition</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {JD_VERSION_CHIPS.map((chip) => {
          const selected = titleFilter === chip.filter;
          return (
            <Button
              key={chip.id}
              size="sm"
              variant={selected ? "primary" : "secondary"}
              onPress={() => {
                setTitleFilter((prev) =>
                  prev === chip.filter ? null : chip.filter,
                );
                setPage(1);
              }}
            >
              {chip.label}
            </Button>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {JD_KPIS.map((kpi) => (
          <Card key={kpi.id} variant="secondary">
            <Card.Header className="gap-1">
              <Card.Title className="text-2xl font-semibold tabular-nums">
                {kpi.value}
              </Card.Title>
              <Card.Description>{kpi.label}</Card.Description>
            </Card.Header>
            {kpi.hint ? (
              <Card.Content className="pt-0">
                <p className="text-xs text-muted">{kpi.hint}</p>
              </Card.Content>
            ) : null}
          </Card>
        ))}
      </div>

      <Card>
        <Card.Content className="gap-0 p-0">
          <Table>
            <Table.ScrollContainer>
              <Table.Content
                aria-label="Job descriptions"
                className="min-w-[640px]"
              >
                <Table.Header>
                  <Table.Column isRowHeader>Job title</Table.Column>
                  <Table.Column>Chapter</Table.Column>
                  <Table.Column>Campaign</Table.Column>
                  <Table.Column>Status</Table.Column>
                  <Table.Column>Actions</Table.Column>
                </Table.Header>
                <Table.Body>
                  {paginatedRows.map((row) => (
                    <Table.Row key={row.id} id={row.id}>
                      <Table.Cell className="font-medium">
                        {row.jobTitle}
                      </Table.Cell>
                      <Table.Cell>{row.chapter}</Table.Cell>
                      <Table.Cell>{row.campaign}</Table.Cell>
                      <Table.Cell>
                        <Chip
                          color={statusChipColor(row.status)}
                          size="sm"
                          variant="soft"
                        >
                          {row.status}
                        </Chip>
                      </Table.Cell>
                      <Table.Cell>
                        <Button
                          aria-label={`View ${row.jobTitle}`}
                          variant="ghost"
                          size="sm"
                          className="min-w-0 px-2"
                          onPress={() => openRow(row)}
                        >
                          <EyeIcon className="size-4" />
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
                  of {filteredRows.length} records
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
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (p) => (
                      <Pagination.Item key={p}>
                        <Pagination.Link
                          isActive={p === safePage}
                          onPress={() => setPage(p)}
                        >
                          {p}
                        </Pagination.Link>
                      </Pagination.Item>
                    ),
                  )}
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
            {detail ? (
              <>
                <Drawer.Header>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip color={statusChipColor(detail.status)} size="sm" variant="soft">
                      {detail.status}
                    </Chip>
                  </div>
                  <Drawer.Heading className="mt-2">{detail.title}</Drawer.Heading>
                  <p className="text-sm text-muted">
                    category {detail.category} · campaign {detail.campaign}
                  </p>
                </Drawer.Header>
                <Drawer.Body className="flex flex-col gap-6">
                  <section>
                    <h3 className="text-sm font-semibold text-foreground">
                      Job description
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      {detail.description}
                    </p>
                    <p className="mt-3 text-sm font-medium text-foreground">
                      Key responsibilities
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                      {detail.responsibilities.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    <p className="mt-3 text-sm text-muted">
                      <span className="font-medium text-foreground">
                        Requirements:{" "}
                      </span>
                      {detail.requirements}
                    </p>
                  </section>

                  <Separator />

                  <section>
                    <h3 className="text-sm font-semibold text-foreground">
                      Version history
                    </h3>
                    <ul className="mt-3 space-y-3">
                      {detail.versions.map((v) => (
                        <li
                          key={v.version}
                          className="flex gap-2 text-sm text-muted"
                        >
                          {v.isCurrent ? (
                            <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-success" />
                          ) : (
                            <span className="mt-0.5 size-4 shrink-0" />
                          )}
                          <div>
                            <span className="font-medium text-foreground">
                              {v.version}
                              {v.isCurrent ? " (Current)" : ""}
                            </span>
                            <span>
                              {" "}
                              · {v.date} · by {v.author}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <Separator />

                  <section>
                    <h3 className="text-sm font-semibold text-foreground">
                      Candidates ({detail.candidates.length})
                    </h3>
                    <ul className="mt-3 space-y-3">
                      {detail.candidates.map((c) => (
                        <li key={c.id} className="flex items-center gap-3">
                          <Avatar className="size-9" aria-label={c.name}>
                            <Avatar.Fallback className="text-xs">
                              {c.initials}
                            </Avatar.Fallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground">
                              {c.name}
                            </p>
                            <p className="text-xs text-muted">{c.stage}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                </Drawer.Body>
                <Drawer.Footer className="flex flex-wrap gap-2">
                  <Button slot="close" variant="secondary">
                    Close
                  </Button>
                  <Button variant="primary">Edit JD</Button>
                </Drawer.Footer>
              </>
            ) : null}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </div>
  );
}
