"use client";

import React from "react";
import Link from "next/link";
import { Table, Select, ListBox, Tooltip, Button } from "@heroui/react";
import { Eye as EyeIcon, Info as RecruitmentInfoIcon, Trash2 as TrashIcon } from "lucide-react";
import { formatJdCalendarDate, jdStatusSelectTriggerClass, jdStatusListItemClass } from "./helpers";
import { useJdDashboard } from "./context";
import { JD_STATUS_OPTIONS, type JdStatus } from "@/lib/jd/types";
import { DataTablePagination } from "@/components/admin/shell/table-system";
import { SectionCard } from "@/components/admin/shell/cards";

export function JdTable() {
  const {
    loading,
    fetchError,
    statusUpdateError,
    paginatedRows,
    filteredRows,
    startIdx,
    endIdx,
    canManageJds,
    statusUpdatingId,
    updateJdStatus,
    setActiveRow,
    setDrawerOpen,
    openEdit,
    setDeletingId,
    deleteModal,
    page,
    setPage,
    totalPages,
    safePage,
  } = useJdDashboard();

  return (
    <SectionCard title="Active Openings" description="List of job descriptions and recruitment details.">
      {(fetchError || statusUpdateError) && (
        <div className="space-y-1 pb-4 text-xs font-semibold text-danger">
          {fetchError ? <p>{fetchError}</p> : null}
          {statusUpdateError ? <p>{statusUpdateError}</p> : null}
        </div>
      )}
      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label="Jobs list" className="min-w-[920px]">
            <Table.Header>
              <Table.Column isRowHeader>Position</Table.Column>
              <Table.Column className="text-center tabular-nums">Applicants</Table.Column>
              <Table.Column>Department</Table.Column>
              <Table.Column>Start date</Table.Column>
              <Table.Column>End date</Table.Column>
              <Table.Column>Hiring deadline</Table.Column>
              <Table.Column>Status</Table.Column>
              <Table.Column>Actions</Table.Column>
            </Table.Header>
            <Table.Body
              key={
                loading
                  ? "jd-table-loading"
                  : paginatedRows.length === 0
                    ? "jd-table-empty"
                    : "jd-table-data"
              }
            >
              {loading ? (
                <Table.Row id="jd-row-loading">
                  <Table.Cell className="py-12 text-center text-sm text-muted font-medium" colSpan={8}>
                    Loading openings...
                  </Table.Cell>
                </Table.Row>
              ) : paginatedRows.length === 0 ? (
                <Table.Row id="jd-row-empty">
                  <Table.Cell className="py-12 text-center text-sm text-muted font-medium" colSpan={8}>
                    No jobs found.
                  </Table.Cell>
                </Table.Row>
              ) : (
                paginatedRows.map((row) => (
                  <Table.Row key={row.id} id={String(row.id)}>
                    <Table.Cell className="py-3.5">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <Link
                          href={`/admin/jd/${row.id}/pipeline`}
                          className="font-bold text-accent hover:underline decoration-accent/40 decoration-2 underline-offset-2 transition-colors text-sm"
                        >
                          {row.position}
                        </Link>
                        {row.has_jd_source_file ? (
                          <a
                            href={`/api/admin/job-descriptions/${row.id}/jd-download`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center rounded-lg bg-surface-secondary border border-divider px-1.5 py-0.5 text-[10px] font-bold text-muted hover:text-foreground"
                          >
                            JD file
                          </a>
                        ) : null}
                      </div>
                    </Table.Cell>
                    <Table.Cell className="text-center tabular-nums font-semibold text-foreground py-3.5">
                      {row.applicant_count ?? 0}
                    </Table.Cell>
                    <Table.Cell className="text-sm font-medium py-3.5">{row.department ?? "—"}</Table.Cell>
                    <Table.Cell className="whitespace-nowrap text-xs text-muted py-3.5">
                      {formatJdCalendarDate(row.start_date)}
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap text-xs text-muted py-3.5">
                      {formatJdCalendarDate(row.end_date)}
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap text-xs text-muted py-3.5">
                      {formatJdCalendarDate(row.hiring_deadline)}
                    </Table.Cell>
                    <Table.Cell className="min-w-[9.5rem] py-3.5">
                      <Select
                        value={row.status}
                        isDisabled={!canManageJds || statusUpdatingId === row.id}
                        onChange={(key) => {
                          if (typeof key === "string")
                            void updateJdStatus(row.id, key as JdStatus);
                        }}
                      >
                        <Select.Trigger
                          className={`h-9 min-h-9 border text-xs rounded-xl ${jdStatusSelectTriggerClass(row.status)}`}
                        >
                          <Select.Value />
                          <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                          <ListBox className="p-1 border border-divider rounded-2xl bg-surface-primary shadow-xl">
                            {JD_STATUS_OPTIONS.map((s) => (
                              <ListBox.Item
                                key={s}
                                id={s}
                                textValue={s}
                                className={`text-xs font-semibold py-1.5 px-2.5 rounded-lg cursor-pointer ${jdStatusListItemClass(s)}`}
                              >
                                {s}
                                <ListBox.ItemIndicator />
                              </ListBox.Item>
                            ))}
                          </ListBox>
                        </Select.Popover>
                      </Select>
                    </Table.Cell>
                    <Table.Cell className="py-3.5">
                      <div className="flex items-center gap-1">
                        <Tooltip delay={0}>
                          <Button
                            aria-label={`View ${row.position}`}
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 min-w-0 p-0 rounded-lg"
                            onPress={() => {
                              setActiveRow(row);
                              setDrawerOpen(true);
                            }}
                          >
                            <EyeIcon className="size-4 text-muted hover:text-foreground" />
                          </Button>
                          <Tooltip.Content placement="top" showArrow>
                            <Tooltip.Arrow />
                            <p>View detail</p>
                          </Tooltip.Content>
                        </Tooltip>
                        {canManageJds ? (
                          <>
                            <Tooltip delay={0}>
                              <Button
                                aria-label={`Hiring details: ${row.position}`}
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 min-w-0 p-0 rounded-lg"
                                onPress={() => openEdit(row)}
                              >
                                <RecruitmentInfoIcon className="size-4 text-muted hover:text-foreground" />
                              </Button>
                              <Tooltip.Content placement="top" showArrow>
                                <Tooltip.Arrow />
                                <p>Hiring details</p>
                              </Tooltip.Content>
                            </Tooltip>
                            <Tooltip delay={0}>
                              <Button
                                aria-label={`Delete ${row.position}`}
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 min-w-0 p-0 rounded-lg text-danger hover:bg-danger/10"
                                onPress={() => {
                                  setDeletingId(row.id);
                                  deleteModal.open();
                                }}
                              >
                                <TrashIcon className="size-4" />
                              </Button>
                              <Tooltip.Content placement="top" showArrow>
                                <Tooltip.Arrow />
                                <p>Delete</p>
                              </Tooltip.Content>
                            </Tooltip>
                          </>
                        ) : null}
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))
              )}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>

      <DataTablePagination
        page={safePage}
        totalPages={totalPages}
        setPage={setPage}
        startIdx={startIdx}
        endIdx={endIdx}
        totalCount={filteredRows.length}
        itemTypeLabel="positions"
      />
    </SectionCard>
  );
}

export default JdTable;
