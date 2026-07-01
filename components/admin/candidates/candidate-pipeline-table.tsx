"use client";

import { memo } from "react";

import { Avatar, Button, Card, Chip, Pagination, Table, Tooltip } from "@heroui/react";

import {
  candidateDisplayInitials,
  candidateStatusChipColor,
  jdMatchChipColor,
} from "@/lib/candidates/candidate-display";
import { candidateStatusUiLabel } from "@/lib/candidates/pipeline-phase";
import type { CandidateRow } from "@/lib/candidates/types";

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

function formatUploadedAtDisplay(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export type CandidatePipelineTableProps = {
  dbLoadState: "loading" | "error" | "ok";
  tableSourceRows: CandidateRow[];
  rows: CandidateRow[];
  noResultsForUploadDate: boolean;
  onOpenRow: (row: CandidateRow) => void;
  onDeleteRequest: (row: CandidateRow) => void;
  page: number;
  totalPages: number;
  setPage: (updater: number | ((p: number) => number)) => void;
  startIdx: number;
  endIdx: number;
  listTotal: number;
};

function CandidatePipelineTableImpl({
  dbLoadState,
  tableSourceRows,
  rows,
  noResultsForUploadDate,
  onOpenRow,
  onDeleteRequest,
  page,
  totalPages,
  setPage,
  startIdx,
  endIdx,
  listTotal,
}: CandidatePipelineTableProps) {
  return (
    <Card>
      <Card.Content className="gap-0 p-0">
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Candidate pipeline" className="min-w-[1400px]">
              <Table.Header>
                <Table.Column isRowHeader>Candidate &amp; Role</Table.Column>
                <Table.Column className="text-center">Exp.</Table.Column>
                <Table.Column>Key Skills</Table.Column>
                <Table.Column>Education</Table.Column>
                <Table.Column>Source</Table.Column>
                <Table.Column>Applied JD</Table.Column>
                <Table.Column className="text-center">JD match</Table.Column>
                <Table.Column>Status</Table.Column>
                <Table.Column className="whitespace-nowrap">Uploaded at</Table.Column>
                <Table.Column className="text-right">Actions</Table.Column>
              </Table.Header>
              <Table.Body>
                {dbLoadState === "loading" && tableSourceRows.length === 0 ? (
                  <Table.Row id="loading">
                    <Table.Cell>
                      <span className="text-sm text-muted">Loading candidates…</span>
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
                rows.length === 0 &&
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
                {rows.map((row) => (
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
                            <p className="font-semibold text-foreground">{row.name}</p>
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
                          <p className="text-xs font-medium text-muted">{row.role}</p>
                        </div>
                      </div>
                    </Table.Cell>
                    <Table.Cell className="text-center align-middle">
                      <div className="flex flex-col items-center tabular-nums">
                        <span className="text-lg font-semibold leading-none text-foreground">
                          {row.experienceYears}
                        </span>
                        <span className="text-[10px] font-medium text-muted">Years</span>
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
                      <p className="text-sm font-medium text-foreground">{row.degree}</p>
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
                      <p
                        className="max-w-[220px] truncate text-sm text-foreground"
                        title={row.jdCampaignLabel}
                      >
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
                        {candidateStatusUiLabel(row.status)}
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
                            onPress={() => onOpenRow(row)}
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
                            onPress={() => onDeleteRequest(row)}
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
                Showing {startIdx} to {endIdx} of {listTotal} candidates
              </Pagination.Summary>
              <Pagination.Content>
                <Pagination.Item>
                  <Pagination.Previous
                    isDisabled={page <= 1}
                    onPress={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <Pagination.PreviousIcon />
                  </Pagination.Previous>
                </Pagination.Item>
                {pageWindow(page, totalPages, 3).map((p) => (
                  <Pagination.Item key={p}>
                    <Pagination.Link isActive={p === page} onPress={() => setPage(p)}>
                      {p}
                    </Pagination.Link>
                  </Pagination.Item>
                ))}
                <Pagination.Item>
                  <Pagination.Next
                    isDisabled={page >= totalPages}
                    onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
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
  );
}

export const CandidatePipelineTable = memo(CandidatePipelineTableImpl);
