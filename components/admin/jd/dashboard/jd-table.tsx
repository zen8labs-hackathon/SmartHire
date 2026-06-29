import React from "react";
import Link from "next/link";
import { Card, Table, Select, ListBox, Tooltip, Button, Pagination } from "@heroui/react";
import { Eye as EyeIcon, Info as RecruitmentInfoIcon, Trash2 as TrashIcon } from "lucide-react";
import { formatJdCalendarDate, jdStatusSelectTriggerClass, jdStatusListItemClass } from "./helpers";
import { useJdDashboard } from "./context";
import { JD_STATUS_OPTIONS, type JdStatus } from "@/lib/jd/types";

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
    <Card>
      <Card.Content className="gap-0 p-0">
        {(fetchError || statusUpdateError) && (
          <div className="space-y-1 px-6 py-4 text-sm text-danger">
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
                    <Table.Cell className="py-8 text-center text-muted" colSpan={8}>
                      Loading…
                    </Table.Cell>
                  </Table.Row>
                ) : paginatedRows.length === 0 ? (
                  <Table.Row id="jd-row-empty">
                    <Table.Cell className="py-8 text-center text-muted" colSpan={8}>
                      No jobs found.
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  paginatedRows.map((row) => (
                    <Table.Row key={row.id} id={String(row.id)}>
                      <Table.Cell>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Link
                            href={`/admin/jd/${row.id}/pipeline`}
                            className="inline-flex max-w-full items-center rounded-md px-1 py-0.5 font-semibold text-accent underline decoration-accent/40 decoration-2 underline-offset-2 transition-colors hover:bg-accent/10 hover:decoration-accent"
                          >
                            {row.position}
                          </Link>
                          {row.has_jd_source_file ? (
                            <a
                              href={`/api/admin/job-descriptions/${row.id}/jd-download`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold text-accent underline-offset-2 hover:underline"
                            >
                              JD file
                            </a>
                          ) : null}
                        </div>
                      </Table.Cell>
                      <Table.Cell className="text-center tabular-nums text-muted">
                        {row.applicant_count ?? 0}
                      </Table.Cell>
                      <Table.Cell>{row.department ?? "—"}</Table.Cell>
                      <Table.Cell className="whitespace-nowrap text-muted">
                        {formatJdCalendarDate(row.start_date)}
                      </Table.Cell>
                      <Table.Cell className="whitespace-nowrap text-muted">
                        {formatJdCalendarDate(row.end_date)}
                      </Table.Cell>
                      <Table.Cell className="whitespace-nowrap text-muted">
                        {formatJdCalendarDate(row.hiring_deadline)}
                      </Table.Cell>
                      <Table.Cell className="min-w-[9.5rem]">
                        <Select
                          value={row.status}
                          isDisabled={!canManageJds || statusUpdatingId === row.id}
                          onChange={(key) => {
                            if (typeof key === "string")
                              void updateJdStatus(row.id, key as JdStatus);
                          }}
                        >
                          <Select.Trigger
                            className={`h-9 min-h-9 border ${jdStatusSelectTriggerClass(row.status)}`}
                          >
                            <Select.Value />
                            <Select.Indicator />
                          </Select.Trigger>
                          <Select.Popover>
                            <ListBox>
                              {JD_STATUS_OPTIONS.map((s) => (
                                <ListBox.Item
                                  key={s}
                                  id={s}
                                  textValue={s}
                                  className={jdStatusListItemClass(s)}
                                >
                                  {s}
                                  <ListBox.ItemIndicator />
                                </ListBox.Item>
                              ))}
                            </ListBox>
                          </Select.Popover>
                        </Select>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex items-center gap-1">
                          <Tooltip delay={0}>
                            <Button
                              aria-label={`View ${row.position}`}
                              variant="ghost"
                              size="sm"
                              className="min-w-0 px-2"
                              onPress={() => {
                                setActiveRow(row);
                                setDrawerOpen(true);
                              }}
                            >
                              <EyeIcon className="size-4" />
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
                                  className="min-w-0 px-2"
                                  onPress={() => openEdit(row)}
                                >
                                  <RecruitmentInfoIcon className="size-4" />
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
                                  className="min-w-0 px-2 text-danger hover:bg-danger/10"
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
          <Table.Footer className="border-t border-divider px-4 py-3">
            <Pagination size="sm">
              <Pagination.Summary>
                Showing {startIdx} to {endIdx} of {filteredRows.length} records
              </Pagination.Summary>
              <Pagination.Content>
                <Pagination.Item>
                  <Pagination.Previous
                    isDisabled={safePage <= 1}
                    onPress={() => setPage(Math.max(1, page - 1))}
                  >
                    <Pagination.PreviousIcon />
                  </Pagination.Previous>
                </Pagination.Item>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
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
                    onPress={() => setPage(Math.min(totalPages, page + 1))}
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
export default JdTable;
