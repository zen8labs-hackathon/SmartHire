"use client";

import { DataTablePagination } from "@/components/admin/shell/table-system";
import { candidateDisplayInitials } from "@/lib/candidates/candidate-display";
import { GroupedCandidateRow } from "@/lib/service/candidate.service";
import { Avatar, Button, Chip, Table, Tooltip } from "@heroui/react";
import dayjs from "dayjs";
import { Eye, Trash2 } from "lucide-react";
import Link from "next/link";
import { memo } from "react";

/** Timestamp for the "Uploaded at" column, as `yyyy/mm/dd HH:mm` (local time). */
function formatUploadedAtDisplay(
  value: string | number | Date | null | undefined,
): string {
  if (value == null || value === "") return "—";
  const d = dayjs(value);
  return d.isValid() ? d.format("YYYY/MM/DD HH:mm") : "—";
}

/** How many skill chips to show inline before collapsing the rest into "+N". */
const MAX_VISIBLE_SKILLS = 6;

/**
 * Splits a candidate's `skills` into the chips rendered inline in the cell and
 * the overflow list that backs the "+N" chip. Safe on `null`/`undefined` and
 * on lists shorter than the cap (then `moreList` is empty).
 */
function splitSkillsForDisplay(skills: string[] | null | undefined): {
  visible: string[];
  moreList: string[];
} {
  const all = skills ?? [];
  return {
    visible: all.slice(0, MAX_VISIBLE_SKILLS),
    moreList: all.slice(MAX_VISIBLE_SKILLS),
  };
}

/** The "Key Skills" table cell: inline chips up to the cap, then a "+N" chip. */
function SkillsCell({ skills }: { skills: string[] | null | undefined }) {
  const { visible, moreList } = splitSkillsForDisplay(skills);
  return (
    <div className="flex flex-wrap gap-1.5 max-w-[320px]">
      {visible.map((s, idx) => (
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
      {moreList.length > 0 ? (
        <MoreSkillsChip count={moreList.length} skills={moreList} />
      ) : null}
    </div>
  );
}

/**
 * The "+N" chip shown when a candidate has more key skills than fit in the
 * table cell. Reveals the rest of the skills on hover; the list is capped
 * at `max-h-48` with `overflow-y-auto` since some candidates have 50+ extra
 * skills, which would otherwise blow past the viewport.
 */
function MoreSkillsChip({
  count,
  skills,
}: {
  count: number;
  skills: string[];
}) {
  return (
    <Tooltip delay={0}>
      <Button
        variant="ghost"
        size="sm"
        className="h-auto min-h-0 w-fit min-w-0 rounded-full bg-transparent p-0 hover:bg-transparent"
        aria-label={`${count} more skills`}
      >
        <Chip
          size="sm"
          variant="soft"
          color="accent"
          className="text-[10px] font-bold"
        >
          +{count}
        </Chip>
      </Button>
      <Tooltip.Content placement="top" showArrow>
        <Tooltip.Arrow />
        <div className="flex max-h-48 max-w-[220px] flex-wrap gap-1.5 overflow-y-auto">
          {skills.map((s, idx) => (
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
        </div>
      </Tooltip.Content>
    </Tooltip>
  );
}

export type CandidatePipelineTableProps = {
  dbLoadState: "loading" | "error" | "ok";
  noCandidatesAdded: boolean;
  rows: GroupedCandidateRow[];
  onOpenDrawer: (row: GroupedCandidateRow) => void;
  onDeleteRequest: (row: GroupedCandidateRow) => void;
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
  noCandidatesAdded,
  rows,
  onOpenDrawer,
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
          <Table.Content
            aria-label="Candidate pipeline"
            className="min-w-[1100px]"
          >
            <Table.Header>
              <Table.Column isRowHeader>Candidate &amp; Role</Table.Column>
              <Table.Column className="text-center">Exp.</Table.Column>
              <Table.Column>Key Skills</Table.Column>
              <Table.Column>Education</Table.Column>
              <Table.Column className="whitespace-nowrap">
                Uploaded at
              </Table.Column>
              <Table.Column className="text-left">Actions</Table.Column>
            </Table.Header>
            <Table.Body>
              {dbLoadState === "loading" && noCandidatesAdded ? (
                <Table.Row id="loading">
                  <Table.Cell colSpan={6} className="py-8 text-center">
                    <span className="text-sm text-muted">
                      Loading candidates…
                    </span>
                  </Table.Cell>
                </Table.Row>
              ) : null}
              {dbLoadState === "ok" &&
              rows.length === 0 &&
              noCandidatesAdded ? (
                <Table.Row id="empty">
                  <Table.Cell colSpan={6} className="py-8 text-center">
                    <span className="text-sm text-muted">
                      No candidates yet. Use Add Candidate to upload CVs.
                    </span>
                  </Table.Cell>
                </Table.Row>
              ) : null}

              {rows.map((row) => (
                <Table.Row key={row.id} id={row.id}>
                  <Table.Cell className="py-3.5">
                    <div className="flex items-center gap-4">
                      <Avatar
                        className="size-10 shrink-0 border border-divider"
                        size="md"
                      >
                        <Avatar.Fallback className="text-xs font-semibold bg-surface-tertiary">
                          {row.name
                            ? candidateDisplayInitials(row.name)
                            : "N/A"}
                        </Avatar.Fallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Link
                            href={`/admin/candidate-detail/${row.id}`}
                            className="font-bold text-foreground cursor-pointer hover:text-accent hover:underline underline-offset-2 text-left transition-colors"
                          >
                            {row.name || "N/A"}
                          </Link>
                        </div>
                        <p className="text-xs font-medium text-muted mt-0.5">
                          {row.role}
                        </p>
                      </div>
                    </div>
                  </Table.Cell>
                  <Table.Cell className="text-center align-middle py-3.5">
                    <div className="flex flex-col items-center tabular-nums">
                      <span className="text-lg font-bold leading-none text-foreground">
                        {row.experience_years || "—"}
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-muted mt-1">
                        Years
                      </span>
                    </div>
                  </Table.Cell>
                  <Table.Cell className="py-3.5">
                    <SkillsCell skills={row.skills} />
                  </Table.Cell>
                  <Table.Cell className="py-3.5">
                    <p className="text-sm font-semibold text-foreground">
                      {row.degree || "—"}
                    </p>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted mt-0.5 truncate max-w-[200px]">
                      {row.education || "—"}
                    </p>
                  </Table.Cell>
                  <Table.Cell className="whitespace-nowrap text-sm text-foreground py-3.5">
                    {formatUploadedAtDisplay(row.created_at)}
                  </Table.Cell>
                  <Table.Cell className="text-right py-3.5">
                    <div className="flex items-center justify-start gap-1">
                      <Tooltip delay={0}>
                        <Button
                          isIconOnly
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 rounded-lg"
                          aria-label="View candidate detail"
                          onPress={() => onOpenDrawer(row)}
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Tooltip.Content placement="top" showArrow>
                          <Tooltip.Arrow />
                          <p>View detail</p>
                        </Tooltip.Content>
                      </Tooltip>
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
