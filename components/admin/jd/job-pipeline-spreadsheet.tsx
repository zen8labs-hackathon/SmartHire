"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import {
  Avatar,
  Breadcrumbs,
  Button,
  Card,
  Chip,
  Pagination,
  Table,
} from "@heroui/react";

import type { JobPipelineCandidateRow, JobPipelineStatus } from "@/lib/jd/pipeline-types";

const ROWS_PER_PAGE = 4;

function statusChipColor(
  status: JobPipelineStatus,
): "success" | "accent" | "danger" | "warning" | "default" {
  switch (status) {
    case "INTERVIEWING":
      return "success";
    case "CV SCREENING":
      return "accent";
    case "REJECTED":
      return "danger";
    case "OFFER":
      return "warning";
    default:
      return "default";
  }
}

function DownloadIcon({ className }: { className?: string }) {
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function UserPlusIcon({ className }: { className?: string }) {
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
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}

function VerifiedIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
    </svg>
  );
}

type Props = {
  jobId: string;
  jobTitle: string;
  totalCandidates: number;
  activeOffers: number;
  rows: JobPipelineCandidateRow[];
};

export function JobPipelineSpreadsheet({
  jobId,
  jobTitle,
  totalCandidates,
  activeOffers,
  rows,
}: Props) {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);

  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * ROWS_PER_PAGE;
    return rows.slice(start, start + ROWS_PER_PAGE);
  }, [rows, safePage]);

  const startIdx = rows.length === 0 ? 0 : (safePage - 1) * ROWS_PER_PAGE + 1;
  const endIdx = Math.min(safePage * ROWS_PER_PAGE, rows.length);

  const groupHeaderClass =
    "bg-surface-secondary text-center text-[10px] font-bold uppercase tracking-wider text-muted";
  const groupBandClass =
    "border-b border-divider py-2 text-center text-[10px] font-bold uppercase tracking-wider text-muted";

  return (
    <div className="relative flex flex-col gap-6 pb-20">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Breadcrumbs className="text-xs text-muted">
            <Breadcrumbs.Item href="/admin/jd">Job descriptions</Breadcrumbs.Item>
            <Breadcrumbs.Item>{jobTitle}</Breadcrumbs.Item>
          </Breadcrumbs>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {jobTitle} pipeline
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" className="gap-2">
            <DownloadIcon className="size-4" />
            Export to Excel
          </Button>
          <Avatar size="sm" color="accent" className="shrink-0">
            <Avatar.Fallback>AD</Avatar.Fallback>
          </Avatar>
        </div>
      </header>

      <Card>
        <Card.Content className="gap-0 p-0">
          <Table>
            <Table.ScrollContainer className="flex flex-col">
              {/*
                React Aria table columns must only contain nested Column nodes as grouping
                children; arbitrary elements (e.g. span) break updateCollection at runtime.
                Group labels use a grid row aligned to the same 10-column layout as the table.
              */}
              <div
                className="grid min-w-[1100px] shrink-0 grid-cols-10 bg-surface-secondary"
                aria-hidden
              >
                <div className={`col-span-4 ${groupBandClass} border-r border-divider`}>
                  Personal info
                </div>
                <div className={`col-span-3 ${groupBandClass} border-r border-divider`}>
                  Education
                </div>
                <div className={`col-span-2 ${groupBandClass} border-r border-divider`}>
                  {"Skills & language"}
                </div>
                <div className={groupBandClass}>Pipeline</div>
              </div>
              <Table.Content
                aria-label={`Candidate pipeline for ${jobTitle}`}
                className="min-w-[1100px]"
              >
                <Table.Header>
                  <Table.Column
                    id="name"
                    isRowHeader
                    className={groupHeaderClass}
                    textValue="Name"
                  >
                    Name
                  </Table.Column>
                  <Table.Column
                    id="dob"
                    className={groupHeaderClass}
                    textValue="Date of birth"
                  >
                    D.O.B.
                  </Table.Column>
                  <Table.Column
                    id="mobile"
                    className={groupHeaderClass}
                    textValue="Mobile"
                  >
                    Mobile
                  </Table.Column>
                  <Table.Column
                    id="email"
                    className={groupHeaderClass}
                    textValue="Email"
                  >
                    Email
                  </Table.Column>
                  <Table.Column
                    id="studentYears"
                    className={groupHeaderClass}
                    textValue="Student years"
                  >
                    Student Years
                  </Table.Column>
                  <Table.Column
                    id="majorSchool"
                    className={groupHeaderClass}
                    textValue="Major and school"
                  >
                    Major/School
                  </Table.Column>
                  <Table.Column id="gpa" className={groupHeaderClass} textValue="GPA">
                    GPA
                  </Table.Column>
                  <Table.Column
                    id="english"
                    className={groupHeaderClass}
                    textValue="English"
                  >
                    English
                  </Table.Column>
                  <Table.Column
                    id="relatedSkills"
                    className={groupHeaderClass}
                    textValue="Related skills"
                  >
                    Related Skills
                  </Table.Column>
                  <Table.Column
                    id="status"
                    className={groupHeaderClass}
                    textValue="Status"
                  >
                    Status
                  </Table.Column>
                </Table.Header>

                <Table.Body>
                  {paginatedRows.map((row) => (
                    <Table.Row key={row.id} id={row.id}>
                      <Table.Cell>
                        <span className="flex items-center gap-1.5">
                          <button
                            type="button"
                            className="text-left text-sm font-semibold text-accent hover:underline"
                          >
                            {row.name}
                          </button>
                          {row.verified ? (
                            <VerifiedIcon
                              className="size-4 shrink-0 text-accent"
                              aria-label="Verified"
                            />
                          ) : null}
                        </span>
                      </Table.Cell>
                      <Table.Cell className="text-sm text-muted">
                        {row.dateOfBirth}
                      </Table.Cell>
                      <Table.Cell className="text-sm tabular-nums text-muted">
                        {row.mobile}
                      </Table.Cell>
                      <Table.Cell className="max-w-[200px] truncate text-sm text-muted">
                        {row.email}
                      </Table.Cell>
                      <Table.Cell className="text-sm text-muted">
                        {row.studentYears}
                      </Table.Cell>
                      <Table.Cell className="text-sm text-muted">
                        {row.majorSchool}
                      </Table.Cell>
                      <Table.Cell className="text-sm tabular-nums text-muted">
                        {row.gpa}
                      </Table.Cell>
                      <Table.Cell className="text-sm text-muted">
                        {row.english}
                      </Table.Cell>
                      <Table.Cell className="max-w-[220px] truncate text-sm text-muted">
                        {row.relatedSkills}
                      </Table.Cell>
                      <Table.Cell>
                        <Chip
                          color={statusChipColor(row.status)}
                          size="sm"
                          variant="soft"
                          className="font-semibold uppercase"
                        >
                          {row.status}
                        </Chip>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>

            <Table.Footer className="flex flex-col gap-3 border-t border-divider px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
                <span className="flex items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full bg-muted"
                    aria-hidden
                  />
                  {totalCandidates} total candidates
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full bg-accent"
                    aria-hidden
                  />
                  {activeOffers} active offer{activeOffers === 1 ? "" : "s"}
                </span>
                <span className="text-muted">
                  Showing {rows.length === 0 ? 0 : startIdx}–{endIdx} of{" "}
                  {rows.length}
                </span>
              </div>
              <Pagination size="sm">
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

      <Button
        variant="primary"
        size="lg"
        className="fixed bottom-8 right-8 z-20 size-14 min-w-0 rounded-full p-0 shadow-lg"
        aria-label="Add candidate"
      >
        <UserPlusIcon className="size-6" />
      </Button>

      <p className="text-center text-xs text-muted">
        <Link href="/admin/jd" className="text-accent hover:underline">
          Back to job descriptions
        </Link>
        <span className="mx-2">·</span>
        <span>Job ID: {jobId}</span>
      </p>
    </div>
  );
}
