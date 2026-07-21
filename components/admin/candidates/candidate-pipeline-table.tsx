"use client";

import { memo } from "react";
import { Avatar, Button, Chip, Table, Tooltip } from "@heroui/react";
import { candidateDisplayInitials } from "@/lib/candidates/candidate-display";
import type { CandidateRow } from "@/lib/candidates/types";
import { formatDisplayDateTime } from "@/lib/format-date";
import { DataTablePagination } from "@/components/admin/shell/table-system";
import { Trash2 } from "lucide-react";

function formatUploadedAtDisplay(iso: string | null): string {
  return formatDisplayDateTime(iso);
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
  setPage: (page: number) => void;
  startIdx: number;
  endIdx: number;
  listTotal: number;
  pageSize: number;
  setPageSize: (size: number) => void;
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
  pageSize,
  setPageSize,
}: CandidatePipelineTableProps) {
  return (
    <div className="space-y-4 font-sans">
      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label="Candidate pipeline" className="min-w-[1100px]">
            <Table.Header>
              <Table.Column isRowHeader>Candidate &amp; Role</Table.Column>
              <Table.Column className="text-center">Exp.</Table.Column>
              <Table.Column>Key Skills</Table.Column>
              <Table.Column>Education</Table.Column>
              <Table.Column className="whitespace-nowrap">Uploaded at</Table.Column>
              <Table.Column className="text-right">Actions</Table.Column>
            </Table.Header>
            <Table.Body>
               {dbLoadState === "loading" && tableSourceRows.length === 0 ? (
                <Table.Row id="loading">
                  <Table.Cell colSpan={6} className="py-8 text-center">
                    <span className="text-sm text-muted">Loading candidates…</span>
                  </Table.Cell>
                </Table.Row>
              ) : null}
              {dbLoadState === "ok" &&
              rows.length === 0 &&
              tableSourceRows.length === 0 ? (
                <Table.Row id="empty">
                  <Table.Cell colSpan={6} className="py-8 text-center">
                    <span className="text-sm text-muted">
                      No candidates yet. Use Add Candidate to upload CVs.
                    </span>
                  </Table.Cell>
                </Table.Row>
              ) : null}
              {noResultsForUploadDate ? (
                <Table.Row id="empty-upload-date">
                  <Table.Cell colSpan={6} className="py-8 text-center">
                    <span className="text-sm text-muted">
                      No results found for this date.
                    </span>
                  </Table.Cell>
                </Table.Row>
              ) : null}
              {rows.map((row) => (
                <Table.Row key={row.id} id={row.id}>
                  <Table.Cell className="py-3.5">
                    <div className="flex items-center gap-4">
                      <Avatar className="size-10 shrink-0 border border-divider" size="md">
                        {row.avatarUrl ? (
                          <Avatar.Image alt="" src={row.avatarUrl} />
                        ) : null}
                        <Avatar.Fallback className="text-xs font-semibold bg-surface-tertiary">
                          {candidateDisplayInitials(row.name)}
                        </Avatar.Fallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <button
                            type="button"
                            className="font-bold text-foreground cursor-pointer hover:text-accent hover:underline underline-offset-2 text-left transition-colors"
                            onClick={() => onOpenRow(row)}
                          >
                            {row.name}
                          </button>
                        </div>
                        <p className="text-xs font-medium text-muted mt-0.5">{row.role}</p>
                      </div>
                    </div>
                  </Table.Cell>
                  <Table.Cell className="text-center align-middle py-3.5">
                    <div className="flex flex-col items-center tabular-nums">
                      <span className="text-lg font-bold leading-none text-foreground">
                        {row.experienceYears}
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-muted mt-1">
                        Years
                      </span>
                    </div>
                  </Table.Cell>
                  <Table.Cell className="py-3.5">
                    <div className="flex flex-wrap gap-1.5 max-w-[320px]">
                      {row.skills.map((s, idx) => (
                        <Chip
                          key={`${s}-${idx}`}
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
                  <Table.Cell className="py-3.5">
                    <p className="text-sm font-semibold text-foreground">{row.degree}</p>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted mt-0.5 truncate max-w-[200px]">
                      {row.school}
                    </p>
                  </Table.Cell>
                  <Table.Cell className="whitespace-nowrap text-sm text-foreground py-3.5">
                    {formatUploadedAtDisplay(row.cvUploadedAtIso)}
                  </Table.Cell>
                  <Table.Cell className="text-right py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip delay={0}>
                        <Button
                          isIconOnly
                          variant="ghost"
                          size="sm"
                          className="text-danger hover:bg-danger/10 h-8 w-8 rounded-lg"
                          aria-label="Delete CV"
                          onPress={() => onDeleteRequest(row)}
                        >
                          <Trash2 className="size-4" />
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
      </Table>

      <DataTablePagination
        page={page}
        totalPages={totalPages}
        setPage={setPage}
        startIdx={startIdx}
        endIdx={endIdx}
        totalCount={listTotal}
        itemTypeLabel="candidates"
        pageSize={pageSize}
        setPageSize={setPageSize}
      />
    </div>
  );
}

export const CandidatePipelineTable = memo(CandidatePipelineTableImpl);
