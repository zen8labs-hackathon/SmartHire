"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  Avatar,
  Button,
  Card,
  Chip,
  Input,
  Label,
  ListBox,
  Modal,
  SearchField,
  Select,
  Table,
  useOverlayState,
} from "@heroui/react";

import {
  candidateDisplayInitials,
  jdMatchChipColor,
} from "@/lib/candidates/candidate-display";
import {
  type CandidateDbRow,
  candidateDbRowToTableRow,
} from "@/lib/candidates/db-row";
import { displayFromParsedPayload } from "@/lib/candidates/parsed-contact";
import {
  allowedTargetsFromStatus,
  isPipelineTransitionAllowed,
} from "@/lib/candidates/pipeline-allowed-transitions";
import type { CandidateRow, CandidateStatus } from "@/lib/candidates/types";
import { createClient } from "@/lib/supabase/client";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";

const FILTER_STATUS_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "all", label: "All statuses" },
  { id: "New", label: "New" },
  { id: "Shortlisted", label: "Shortlisted" },
  { id: "Interviewing", label: "Interviewing" },
  { id: "Offer", label: "Offer" },
  { id: "Failed", label: "Failed" },
  { id: "Matched", label: "Matched" },
  { id: "Rejected", label: "Rejected" },
];

type Props = {
  jobDescriptionId: number;
  jobId: string;
  dbRows: CandidateDbRow[];
  loadState: "idle" | "loading" | "error" | "ok";
  onRefetch: () => void;
  /** HR may change pipeline status and schedule; chapter recruiters are view-only here. */
  canEditPipeline?: boolean;
};

function isNewPoolStatus(status: string) {
  return status === "New" || status === "Shortlisted";
}

function formatSchedule(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(t));
}

function uploadSortKey(r: CandidateDbRow): number {
  const raw = r.cv_uploaded_at ?? r.created_at;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? 0 : t;
}

function localDatetimeToIso(local: string): string | null {
  if (!local?.trim()) return null;
  const ms = new Date(local).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function isoToDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function cvDay(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function rowMatchesUploadRange(
  r: CandidateDbRow,
  from: string,
  to: string,
): boolean {
  const day = cvDay(r.cv_uploaded_at ?? r.created_at);
  if (!day) return !from && !to;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function rowMatchesSearch(r: CandidateDbRow, q: string): boolean {
  if (!q.trim()) return true;
  const c = displayFromParsedPayload(r.parsed_payload);
  const hay = [
    r.name,
    r.original_filename,
    c.email,
    c.phone,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q.trim().toLowerCase());
}

export function JdAppliedCandidatesPipeline({
  jobDescriptionId,
  jobId,
  dbRows,
  loadState,
  onRefetch,
  canEditPipeline = true,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [rowUpdating, setRowUpdating] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [uploadFrom, setUploadFrom] = useState("");
  const [uploadTo, setUploadTo] = useState("");

  const [onboardingDrafts, setOnboardingDrafts] = useState<
    Record<string, string>
  >({});

  const [interviewDrafts, setInterviewDrafts] = useState<Record<string, string>>(
    {},
  );

  const offerModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) {
        setOnboardingDrafts({});
        setPipelineError(null);
      }
    },
  });

  useEffect(() => {
    setSelected(new Set());
  }, [dbRows]);

  const statusCounts = useMemo(() => {
    let newPool = 0;
    let interviewing = 0;
    let offer = 0;
    let matched = 0;
    for (const r of dbRows) {
      if (isNewPoolStatus(r.status)) newPool += 1;
      else if (r.status === "Interviewing") interviewing += 1;
      else if (r.status === "Offer") offer += 1;
      else if (r.status === "Matched") matched += 1;
    }
    return { newPool, interviewing, offer, matched };
  }, [dbRows]);

  const filteredRows = useMemo(() => {
    let rows = [...dbRows];
    rows.sort((a, b) => uploadSortKey(b) - uploadSortKey(a));

    const q = query.trim();
    const sf = statusFilter;
    rows = rows.filter((r) => rowMatchesSearch(r, q));
    rows = rows.filter((r) => rowMatchesUploadRange(r, uploadFrom, uploadTo));
    if (sf !== "all") {
      rows = rows.filter((r) => r.status === sf);
    }
    return rows;
  }, [dbRows, query, statusFilter, uploadFrom, uploadTo]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const postPipeline = useCallback(
    async (updates: unknown[]) => {
      const h = await getSessionAuthorizationHeaders(supabase);
      const res = await fetch("/api/admin/candidates/pipeline", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(h.Authorization ? { Authorization: h.Authorization } : {}),
        },
        body: JSON.stringify({ jobDescriptionId, updates }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Update failed.");
    },
    [jobDescriptionId, supabase],
  );

  const selectedRows = useMemo(() => {
    return [...selected]
      .map((id) => dbRows.find((r) => r.id === id))
      .filter(Boolean) as CandidateDbRow[];
  }, [selected, dbRows]);

  const bulkInterviewEligible = useMemo(
    () =>
      selectedRows.length > 0 &&
      selectedRows.every((r) => isNewPoolStatus(r.status)),
    [selectedRows],
  );

  const bulkOfferEligible = useMemo(
    () =>
      selectedRows.length > 0 &&
      selectedRows.every((r) => r.status === "Interviewing"),
    [selectedRows],
  );

  const bulkFailEligible = useMemo(
    () =>
      selectedRows.length > 0 &&
      selectedRows.every((r) => isPipelineTransitionAllowed(r.status, "Failed")),
    [selectedRows],
  );

  const openOfferModal = useCallback(() => {
    const ids = selectedRows
      .filter((r) => r.status === "Interviewing")
      .map((r) => r.id);
    if (ids.length === 0) return;
    const drafts: Record<string, string> = {};
    for (const id of ids) drafts[id] = "";
    setOnboardingDrafts(drafts);
    offerModal.open();
  }, [selectedRows, offerModal]);

  const confirmOffer = useCallback(async () => {
    const entries = Object.entries(onboardingDrafts);
    for (const [, v] of entries) {
      if (!v?.trim()) {
        setPipelineError(
          "Please set onboarding date and time for every candidate.",
        );
        return;
      }
    }
    const updates: { id: string; status: "Offer"; onboarding_at: string }[] =
      [];
    for (const [id, local] of entries) {
      const iso = localDatetimeToIso(local);
      if (!iso) {
        setPipelineError("One or more onboarding times are invalid.");
        return;
      }
      updates.push({ id, status: "Offer", onboarding_at: iso });
    }
    setPipelineError(null);
    setPipelineBusy(true);
    try {
      await postPipeline(updates);
      offerModal.close();
      onRefetch();
    } catch (e) {
      setPipelineError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setPipelineBusy(false);
    }
  }, [onboardingDrafts, offerModal, onRefetch, postPipeline]);

  const moveSelectedToInterview = useCallback(async () => {
    if (!bulkInterviewEligible) return;
    setPipelineBusy(true);
    setPipelineError(null);
    try {
      await postPipeline(
        selectedRows.map((r) => ({ id: r.id, status: "Interviewing" as const })),
      );
      onRefetch();
    } catch (e) {
      setPipelineError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setPipelineBusy(false);
    }
  }, [bulkInterviewEligible, onRefetch, postPipeline, selectedRows]);

  const markSelectedFailed = useCallback(async () => {
    if (!bulkFailEligible) return;
    setPipelineBusy(true);
    setPipelineError(null);
    try {
      await postPipeline(
        selectedRows.map((r) => ({ id: r.id, status: "Failed" as const })),
      );
      onRefetch();
    } catch (e) {
      setPipelineError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setPipelineBusy(false);
    }
  }, [bulkFailEligible, onRefetch, postPipeline, selectedRows]);

  const onStatusChange = useCallback(
    async (id: string, next: CandidateStatus) => {
      setRowUpdating(id);
      setPipelineError(null);
      try {
        await postPipeline([{ id, status: next }]);
        onRefetch();
      } catch (e) {
        setPipelineError(e instanceof Error ? e.message : "Update failed.");
      } finally {
        setRowUpdating(null);
      }
    },
    [onRefetch, postPipeline],
  );

  const patchTimeline = useCallback(
    async (
      id: string,
      body: { interview_at?: string | null; onboarding_at?: string | null },
    ) => {
      const h = await getSessionAuthorizationHeaders(supabase);
      const res = await fetch(`/api/admin/candidates/${id}/timeline`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(h.Authorization ? { Authorization: h.Authorization } : {}),
        },
        body: JSON.stringify({ jobDescriptionId, ...body }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Update failed.");
    },
    [jobDescriptionId, supabase],
  );

  const saveInterviewTime = useCallback(
    async (id: string) => {
      const local = interviewDrafts[id] ?? "";
      setPipelineError(null);
      try {
        const iso = local.trim() ? localDatetimeToIso(local) : null;
        await patchTimeline(id, { interview_at: iso });
        onRefetch();
      } catch (e) {
        setPipelineError(e instanceof Error ? e.message : "Update failed.");
      }
    },
    [interviewDrafts, onRefetch, patchTimeline],
  );

  const saveOnboardingTime = useCallback(
    async (id: string) => {
      const local = interviewDrafts[`ob-${id}`] ?? "";
      setPipelineError(null);
      try {
        const iso = local.trim() ? localDatetimeToIso(local) : null;
        await patchTimeline(id, { onboarding_at: iso });
        onRefetch();
      } catch (e) {
        setPipelineError(e instanceof Error ? e.message : "Update failed.");
      }
    },
    [interviewDrafts, onRefetch, patchTimeline],
  );

  useEffect(() => {
    setInterviewDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const r of dbRows) {
        if (r.status === "Interviewing" && next[r.id] === undefined) {
          next[r.id] = isoToDatetimeLocalValue(r.interview_at);
          changed = true;
        }
        const obKey = `ob-${r.id}`;
        if (r.status === "Offer" && next[obKey] === undefined) {
          next[obKey] = isoToDatetimeLocalValue(r.onboarding_at);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [dbRows]);

  if (loadState === "loading") {
    return <p className="mt-3 text-sm text-muted">Loading…</p>;
  }
  if (loadState === "error") {
    return (
      <p className="mt-3 text-sm text-danger">
        Could not load candidates. Try again later.
      </p>
    );
  }
  if (loadState === "ok" && dbRows.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted">
        No candidates yet. Link a job opening to this JD and add applicants from
        the Candidates page or the JD pipeline.
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-4">
      {pipelineError ? (
        <p className="text-sm text-danger">{pipelineError}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card variant="secondary">
          <Card.Header className="gap-0.5">
            <Card.Title className="text-2xl font-semibold tabular-nums">
              {statusCounts.newPool}
            </Card.Title>
            <Card.Description>New / Shortlisted</Card.Description>
          </Card.Header>
        </Card>
        <Card variant="secondary">
          <Card.Header className="gap-0.5">
            <Card.Title className="text-2xl font-semibold tabular-nums">
              {statusCounts.interviewing}
            </Card.Title>
            <Card.Description>Interview</Card.Description>
          </Card.Header>
        </Card>
        <Card variant="secondary">
          <Card.Header className="gap-0.5">
            <Card.Title className="text-2xl font-semibold tabular-nums">
              {statusCounts.offer}
            </Card.Title>
            <Card.Description>Offer</Card.Description>
          </Card.Header>
        </Card>
        <Card variant="secondary">
          <Card.Header className="gap-0.5">
            <Card.Title className="text-2xl font-semibold tabular-nums">
              {statusCounts.matched}
            </Card.Title>
            <Card.Description>Matched</Card.Description>
          </Card.Header>
        </Card>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-divider bg-surface-secondary/30 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <SearchField
            value={query}
            onChange={setQuery}
            className="min-w-[220px] flex-1"
          >
            <SearchField.Group className="w-full">
              <SearchField.SearchIcon />
              <SearchField.Input
                placeholder="Search name, email, phone…"
                className="w-full min-w-0"
              />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <Select
            value={statusFilter}
            onChange={(k) => {
              if (typeof k === "string") setStatusFilter(k);
            }}
            className="min-w-[180px]"
          >
            <Label className="sr-only">Status</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {FILTER_STATUS_OPTIONS.map((opt) => (
                  <ListBox.Item
                    key={opt.id}
                    id={opt.id}
                    textValue={opt.label}
                  >
                    {opt.label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <div className="w-full min-w-0 rounded-xl border border-divider bg-surface-secondary/50 px-4 py-3 lg:w-auto lg:max-w-md">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              CV upload date
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Label className="text-sm font-medium text-foreground">
                  From
                </Label>
                <Input
                  type="date"
                  value={uploadFrom}
                  onChange={(e) => setUploadFrom(e.target.value)}
                  className="w-full min-w-0 sm:w-[12rem]"
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Label className="text-sm font-medium text-foreground">
                  To
                </Label>
                <Input
                  type="date"
                  value={uploadTo}
                  onChange={(e) => setUploadTo(e.target.value)}
                  className="w-full min-w-0 sm:w-[12rem]"
                />
              </div>
            </div>
          </div>
        </div>

        {selected.size > 0 ? (
          <div className="flex flex-wrap gap-2 border-t border-divider pt-3">
            <span className="self-center text-xs text-muted">
              {selected.size} selected
            </span>
            <Button
              size="sm"
              variant="primary"
              className="bg-gradient-to-br from-[#002542] to-[#1b3b5a]"
              isDisabled={
                !canEditPipeline || pipelineBusy || !bulkInterviewEligible
              }
              onPress={() => void moveSelectedToInterview()}
            >
              Move to interview
            </Button>
            <Button
              size="sm"
              variant="primary"
              className="bg-gradient-to-br from-[#002542] to-[#1b3b5a]"
              isDisabled={!canEditPipeline || pipelineBusy || !bulkOfferEligible}
              onPress={openOfferModal}
            >
              Move to offer…
            </Button>
            <Button
              size="sm"
              variant="secondary"
              isDisabled={!canEditPipeline || pipelineBusy || !bulkFailEligible}
              onPress={() => void markSelectedFailed()}
            >
              Mark failed
            </Button>
          </div>
        ) : null}
      </div>

      <Table>
        <Table.ScrollContainer>
          <Table.Content
            aria-label="Candidates for this job description"
            className="min-w-[1100px]"
          >
            <Table.Header>
              <Table.Column className="w-10" textValue="Select" />
              <Table.Column isRowHeader>Candidate</Table.Column>
              <Table.Column>Contact</Table.Column>
              <Table.Column>Education</Table.Column>
              <Table.Column>Skills</Table.Column>
              <Table.Column>English</Table.Column>
              <Table.Column>GPA</Table.Column>
              <Table.Column className="text-center">JD match</Table.Column>
              <Table.Column>Pipeline</Table.Column>
              <Table.Column>CV uploaded</Table.Column>
              <Table.Column>Schedule</Table.Column>
            </Table.Header>
            <Table.Body>
              {filteredRows.map((r) => {
                const row: CandidateRow = candidateDbRowToTableRow(r);
                const contact = displayFromParsedPayload(r.parsed_payload);
                const skills = (r.skills ?? []).slice(0, 6).join(", ") || "—";
                const edu = [r.degree, r.school].filter(Boolean).join(" · ") || "—";
                const busy = rowUpdating === r.id;
                return (
                  <Table.Row key={r.id} id={r.id}>
                    <Table.Cell className="align-top">
                      <input
                        type="checkbox"
                        className="mt-1 size-4 rounded border-divider accent-accent"
                        checked={selected.has(r.id)}
                        disabled={!canEditPipeline}
                        onChange={() => toggleSelect(r.id)}
                        aria-label={`Select ${row.name}`}
                      />
                    </Table.Cell>
                    <Table.Cell className="align-top">
                      <div className="flex items-start gap-2">
                        <Avatar className="size-9 shrink-0" size="sm">
                          {row.avatarUrl ? (
                            <Avatar.Image alt="" src={row.avatarUrl} />
                          ) : null}
                          <Avatar.Fallback className="text-[10px]">
                            {candidateDisplayInitials(row.name)}
                          </Avatar.Fallback>
                        </Avatar>
                        <div className="min-w-0">
                          <Link
                            href={`/admin/jd/${jobId}/pipeline/${encodeURIComponent(r.id)}/evaluation`}
                            className="font-semibold text-accent hover:underline"
                          >
                            {row.name}
                          </Link>
                          <p className="text-xs text-muted">{row.role}</p>
                        </div>
                      </div>
                    </Table.Cell>
                    <Table.Cell className="max-w-[200px] align-top text-sm text-muted">
                      <p className="break-all">{contact.email}</p>
                      <p className="tabular-nums">{contact.phone}</p>
                    </Table.Cell>
                    <Table.Cell className="max-w-[200px] align-top text-sm text-muted">
                      {edu}
                    </Table.Cell>
                    <Table.Cell className="max-w-[220px] align-top text-xs text-muted">
                      {skills}
                    </Table.Cell>
                    <Table.Cell className="align-top text-sm text-muted">
                      {contact.englishLevel}
                    </Table.Cell>
                    <Table.Cell className="align-top text-sm tabular-nums text-muted">
                      {contact.gpa}
                    </Table.Cell>
                    <Table.Cell className="align-top text-center">
                      <Chip
                        size="sm"
                        variant="soft"
                        color={jdMatchChipColor(row)}
                        className="min-w-[3rem] justify-center text-xs font-bold tabular-nums"
                      >
                        {row.jdMatchLabel}
                      </Chip>
                    </Table.Cell>
                    <Table.Cell className="align-top">
                      <Select
                        value={row.status}
                        isDisabled={!canEditPipeline || busy}
                        onChange={(key) => {
                          if (typeof key === "string")
                            void onStatusChange(r.id, key as CandidateStatus);
                        }}
                      >
                        <Select.Trigger className="h-9 min-h-9 min-w-[9.5rem]">
                          <Select.Value />
                          <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                          <ListBox>
                            {allowedTargetsFromStatus(r.status).map((s) => (
                              <ListBox.Item key={s} id={s} textValue={s}>
                                {s}
                                <ListBox.ItemIndicator />
                              </ListBox.Item>
                            ))}
                          </ListBox>
                        </Select.Popover>
                      </Select>
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap align-top text-xs text-muted">
                      {formatSchedule(r.cv_uploaded_at ?? r.created_at) ?? "—"}
                    </Table.Cell>
                    <Table.Cell className="max-w-[220px] align-top">
                      {r.status === "Interviewing" ? (
                        <div className="flex flex-col gap-1">
                          <Input
                            type="datetime-local"
                            value={interviewDrafts[r.id] ?? ""}
                            disabled={!canEditPipeline}
                            onChange={(e) =>
                              setInterviewDrafts((d) => ({
                                ...d,
                                [r.id]: e.target.value,
                              }))
                            }
                            className="w-full min-w-[11rem]"
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            className="self-start"
                            isDisabled={!canEditPipeline || busy}
                            onPress={() => void saveInterviewTime(r.id)}
                          >
                            Save interview time
                          </Button>
                        </div>
                      ) : r.status === "Offer" ? (
                        <div className="flex flex-col gap-1">
                          <Input
                            type="datetime-local"
                            value={interviewDrafts[`ob-${r.id}`] ?? ""}
                            disabled={!canEditPipeline}
                            onChange={(e) =>
                              setInterviewDrafts((d) => ({
                                ...d,
                                [`ob-${r.id}`]: e.target.value,
                              }))
                            }
                            className="w-full min-w-[11rem]"
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            className="self-start"
                            isDisabled={!canEditPipeline || busy}
                            onPress={() => void saveOnboardingTime(r.id)}
                          >
                            Save onboarding
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>

      {filteredRows.length === 0 ? (
        <p className="text-center text-sm text-muted">
          No candidates match the current filters.
        </p>
      ) : null}

      <Modal.Backdrop
        isOpen={offerModal.isOpen}
        onOpenChange={offerModal.setOpen}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-lg overflow-hidden p-0">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-divider px-5 py-4">
              <Modal.Heading>Onboarding dates</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
              <p className="text-sm text-muted">
                Set the onboarding date and time for each selected candidate.
              </p>
              {Object.keys(onboardingDrafts).map((id) => {
                const row = dbRows.find((x) => x.id === id);
                const label = row
                  ? candidateDbRowToTableRow(row).name
                  : id.slice(0, 8);
                return (
                  <div key={id} className="space-y-1">
                    <Label className="text-xs font-medium">{label}</Label>
                    <Input
                      type="datetime-local"
                      value={onboardingDrafts[id] ?? ""}
                      onChange={(e) =>
                        setOnboardingDrafts((d) => ({
                          ...d,
                          [id]: e.target.value,
                        }))
                      }
                      className="w-full"
                    />
                  </div>
                );
              })}
              {pipelineError && offerModal.isOpen ? (
                <p className="text-sm text-danger">{pipelineError}</p>
              ) : null}
            </Modal.Body>
            <Modal.Footer className="justify-end gap-2 border-t border-divider px-5 py-4">
              <Button variant="secondary" onPress={offerModal.close}>
                Cancel
              </Button>
              <Button
                variant="primary"
                isDisabled={pipelineBusy}
                onPress={() => void confirmOffer()}
              >
                Confirm
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}
